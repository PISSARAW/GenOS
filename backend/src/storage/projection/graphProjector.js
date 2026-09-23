'use strict';

/**
 * Graph Projector — consumes projection events and projects them into the graph store.
 *
 * Primary: LadybugDB (when @ladybugdb/core is available)
 * Fallback: SQLite graph_nodes/graph_edges tables (bounded CTE traversal)
 *
 * The projector is idempotent: replaying an event produces the same graph state.
 */

const {
  getUnconsumedEvents,
  markConsumed,
  markProjected,
  recordProjectionFailure,
  getUnresolvedFailures,
  resolveFailure,
  startRebuild,
  completeRebuild,
} = require('./projectionOutbox');
const { createGraphRepository } = require('../graph/graphRepository');

const CONSUMER_NAME = 'graph';

class GraphProjector {
  constructor(db) {
    this._db = db;
    this._graph = createGraphRepository(db);
    this._running = false;
  }

  /**
   * Process unconsumed events (one batch).
   * Returns number of events processed.
   */
  async processBatch(limit = 100) {
    const { events, lastSequence } = await getUnconsumedEvents(CONSUMER_NAME, limit);
    if (!events.length) return 0;
    let processed = 0;
    for (const event of events) {
      try {
        await this._projectEvent(event);
        await markProjected(event.event_id, 'graph');
        processed++;
      } catch (error) {
        await recordProjectionFailure(event.event_id, CONSUMER_NAME, error);
      }
    }
    const maxSeq = events[events.length - 1].sequence;
    if (maxSeq > lastSequence) {
      await markConsumed(CONSUMER_NAME, maxSeq);
    }
    return processed;
  }

  async _projectEvent(event) {
    const { aggregate_type, aggregate_id, event_type, payload_json } = event;
    const payload = JSON.parse(payload_json);
    switch (event_type) {
      case 'AGENT_CREATED':
      case 'AGENT_UPDATED':
        await this._graph.upsertNode({
          id: aggregate_id,
          label: 'Agent',
          properties: { name: payload.name, role: payload.role, status: payload.status, ...payload },
        });
        break;
      case 'AGENT_REMOVED':
        // Graph store handles node removal
        break;
      case 'RELATION_ADDED':
        await this._graph.upsertEdge({
          id: `rel_${aggregate_id}`,
          source: payload.source_agent_id,
          target: payload.target_agent_id,
          label: payload.relation_type || 'RELATION',
          properties: { ...payload },
        });
        break;
      case 'RELATION_REMOVED':
        // Graph store handles edge removal
        break;
      case 'GENOME_UPDATED':
        await this._graph.upsertNode({
          id: aggregate_id,
          label: 'Genome',
          properties: { ...payload },
        });
        break;
      case 'MISSION_STARTED':
      case 'MISSION_COMPLETED':
        await this._graph.upsertNode({
          id: aggregate_id,
          label: 'Mission',
          properties: { ...payload },
        });
        break;
      case 'CLAIM_ADDED':
        await this._graph.upsertNode({
          id: aggregate_id,
          label: 'Claim',
          properties: { ...payload },
        });
        break;
      case 'EVIDENCE_ADDED':
        await this._graph.upsertNode({
          id: aggregate_id,
          label: 'Evidence',
          properties: { ...payload },
        });
        break;
      case 'FINDING_ADDED':
      case 'FINDING_VALIDATED':
      case 'FINDING_REFUTED':
        await this._graph.upsertNode({
          id: aggregate_id,
          label: 'Finding',
          properties: { ...payload },
        });
        break;
      case 'SNAPSHOT_CREATED':
        await this._graph.upsertNode({
          id: aggregate_id,
          label: 'Snapshot',
          properties: { ...payload },
        });
        break;
      default:
        // Unknown event type: skip (no failure recorded)
        break;
    }
  }

  /**
   * Rebuild the entire graph projection from scratch.
   */
  async rebuild() {
    const rebuildId = await startRebuild(CONSUMER_NAME, 0);
    try {
      const db = this._db;
      // Project all agents
      const agents = await db.all('SELECT id, name, role, status, parent_agent_id FROM agents');
      for (const agent of agents) {
        await this._graph.upsertNode({
          id: agent.id,
          label: 'Agent',
          properties: { name: agent.name, role: agent.role, status: agent.status },
        });
      }
      // Project all relations
      const relations = await db.all('SELECT id, source_agent_id, target_agent_id, relation_type FROM agent_relations');
      for (const rel of relations) {
        await this._graph.upsertEdge({
          id: `rel_${rel.id}`,
          source: rel.source_agent_id,
          target: rel.target_agent_id,
          label: rel.relation_type || 'RELATION',
          properties: { ...rel },
        });
      }
      // Project lineage
      const lineage = await db.all('SELECT id, parent_id, child_id FROM lineage_edges');
      for (const edge of lineage) {
        await this._graph.upsertEdge({
          id: `lin_${edge.id}`,
          source: edge.parent_id,
          target: edge.child_id,
          label: 'DESCENDS_FROM',
          properties: { ...edge },
        });
      }
      // Reset consumer cursor
      await markConsumed(CONSUMER_NAME, 0);
      await completeRebuild(rebuildId, { toSequence: 0, status: 'completed' });
    } catch (error) {
      await completeRebuild(rebuildId, { toSequence: 0, status: 'failed', errorMessage: error.message });
      throw error;
    }
  }

  /**
   * Retry unresolved failures.
   */
  async retryFailures() {
    const failures = await getUnresolvedFailures(50);
    let retried = 0;
    for (const failure of failures) {
      try {
        const event = await this._db.get(
          'SELECT * FROM projection_events WHERE event_id = ?',
          [failure.event_id]
        );
        if (event) {
          await this._projectEvent(event);
          await markProjected(event.event_id, 'graph');
          await resolveFailure(failure.id);
          retried++;
        }
      } catch (_) {
        // Still failing: leave for next retry
      }
    }
    return retried;
  }

  /**
   * Start the projector loop (for daemon mode).
   */
  start(intervalMs = 5000) {
    if (this._running) return;
    this._running = true;
    const loop = async () => {
      if (!this._running) return;
      try {
        await this.processBatch(100);
        await this.retryFailures();
      } catch (_) {
        // Log and continue
      }
      if (this._running) {
        setTimeout(loop, intervalMs);
      }
    };
    loop();
  }

  stop() {
    this._running = false;
  }
}

module.exports = { GraphProjector };
