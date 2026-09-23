'use strict';

/**
 * Graph Projector — consumes projection events and projects them into the graph store.
 *
 * The projector re-reads the canonical row from SQLite — the outbox
 * only carries the key (table, operation, id), not the payload.
 *
 * This maintains: SQLite = truth. Ladybug = projection.
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

const CONSUMER_NAME = 'graph';

class GraphProjector {
  constructor(db) {
    this._db = db;
    this._running = false;
  }

  async init() {
    const { LadybugStore } = require('../graph/ladybugStore');
    const { SQLiteGraphRepository } = require('../graph/graphRepository');
    try {
      const store = new LadybugStore();
      await store.init();
      this._graph = store;
    } catch (_) {
      this._graph = new SQLiteGraphRepository(this._db);
    }
    return this;
  }

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
    const { aggregate_type, aggregate_id, event_type } = event;
    const payload = event.payload_json ? JSON.parse(event.payload_json) : {};
    const table = payload.table;
    const operation = payload.operation;
    switch (event_type) {
      case 'AGENT_CREATED':
      case 'AGENT_UPDATED':
        await this._upsertAgent(aggregate_id);
        break;
      case 'AGENT_REMOVED':
        await this._deleteNode(aggregate_id);
        break;
      case 'RELATION_ADDED':
      case 'RELATION_UPDATED':
        await this._upsertRelation(aggregate_id);
        break;
      case 'RELATION_REMOVED':
        await this._deleteEdge(aggregate_id);
        break;
      case 'LINEAGE_ADDED':
      case 'LINEAGE_UPDATED':
        await this._upsertLineage(aggregate_id);
        break;
      case 'LINEAGE_REMOVED':
        await this._deleteEdge(aggregate_id);
        break;
      case 'SYNAPSE_ADDED':
      case 'SYNAPSE_UPDATED':
        await this._upsertSynapse(aggregate_id);
        break;
      case 'SYNAPSE_REMOVED':
        await this._deleteEdge(aggregate_id);
        break;
      case 'CONCEPT_RELATION_ADDED':
      case 'CONCEPT_RELATION_UPDATED':
        await this._upsertConceptRelation(aggregate_id);
        break;
      case 'CONCEPT_RELATION_REMOVED':
        await this._deleteEdge(aggregate_id);
        break;
      case 'TERRITORY_EDGE_ADDED':
      case 'TERRITORY_EDGE_UPDATED':
        await this._upsertTerritoryEdge(aggregate_id);
        break;
      case 'TERRITORY_EDGE_REMOVED':
        await this._deleteEdge(aggregate_id);
        break;
      case 'TRINITY_WORLD_CREATED':
      case 'TRINITY_WORLD_UPDATED':
        await this._upsertTrinityWorld(aggregate_id);
        break;
      case 'COLLECTIVE_DECISION_CREATED':
      case 'COLLECTIVE_DECISION_UPDATED':
        await this._upsertCollectiveDecision(aggregate_id);
        break;
      case 'CONTINUATION_QUEUED':
      case 'CONTINUATION_UPDATED':
        await this._upsertContinuation(aggregate_id);
        break;
      case 'DAEMON_TERRITORY_GRAPH_CREATED':
      case 'DAEMON_TERRITORY_GRAPH_UPDATED':
        await this._upsertDaemonTerritory(aggregate_id);
        break;
      default:
        throw new Error(`UNSUPPORTED_EVENT: ${event_type}`);
    }
  }

  async _upsertAgent(id) {
    const row = await this._db.get('SELECT id, name, role, status, parent_agent_id, workspace_id FROM agents WHERE id = ?', id);
    if (!row) return;
    await this._graph.upsertNode({ id: row.id, label: 'Agent', properties: row });
    if (row.parent_agent_id) {
      await this._graph.upsertEdge({ id: `parent_${row.id}`, source: row.parent_agent_id, target: row.id, label: 'PARENT_OF', properties: {} });
    }
  }

  async _upsertRelation(id) {
    const row = await this._db.get('SELECT id, source_agent_id, target_agent_id, relation_type FROM agent_relations WHERE id = ?', id);
    if (!row) return;
    await this._graph.upsertEdge({ id: row.id, source: row.source_agent_id, target: row.target_agent_id, label: row.relation_type || 'RELATION', properties: row });
  }

  async _upsertLineage(id) {
    const row = await this._db.get('SELECT id, source_node_id, target_node_id, edge_type FROM lineage_edges WHERE id = ?', id);
    if (!row) return;
    await this._graph.upsertEdge({ id: row.id, source: row.source_node_id, target: row.target_node_id, label: row.edge_type || 'DESCENDS_FROM', properties: row });
  }

  async _upsertSynapse(id) {
    const row = await this._db.get('SELECT source_id, target_id, weight FROM memory_synapses WHERE source_id = ? AND target_id = ?', id.split(':')[1], id.split(':')[2]);
    if (!row) return;
    await this._graph.upsertEdge({ id: id, source: row.source_id, target: row.target_id, label: 'SYNAPSE', properties: row });
  }

  async _upsertConceptRelation(id) {
    const row = await this._db.get('SELECT id, source_id, target_id, relation_type FROM knowledge_graph_relations WHERE id = ?', id);
    if (!row) return;
    await this._graph.upsertEdge({ id: row.id, source: row.source_id, target: row.target_id, label: row.relation_type || 'RELATED_TO', properties: row });
  }

  async _upsertTerritoryEdge(id) {
    const row = await this._db.get('SELECT id, source_id, target_id, relation FROM territory_graph_edges WHERE id = ?', id);
    if (!row) return;
    await this._graph.upsertEdge({ id: row.id, source: row.source_id, target: row.target_id, label: row.relation || 'TERRITORY_EDGE', properties: row });
  }

  async _upsertTrinityWorld(id) {
    const row = await this._db.get('SELECT id, mission, world_number, name, strategy, status FROM trinity_worlds WHERE id = ?', id);
    if (!row) return;
    await this._graph.upsertNode({ id: row.id, label: 'Experiment', properties: row });
  }

  async _upsertCollectiveDecision(id) {
    const row = await this._db.get('SELECT id, topic, status, proposal_json FROM collective_decisions WHERE id = ?', id);
    if (!row) return;
    await this._graph.upsertNode({ id: row.id, label: 'Claim', properties: row });
  }

  async _upsertContinuation(id) {
    const row = await this._db.get('SELECT id, agent_id, orchestrator_id, status FROM continuation_queue WHERE id = ?', id);
    if (!row) return;
    await this._graph.upsertNode({ id: row.id, label: 'Mission', properties: row });
  }

  async _upsertDaemonTerritory(id) {
    const row = await this._db.get('SELECT id, territory_id, node_id, node_type FROM daemon_territory_graph WHERE id = ?', id);
    if (!row) return;
    await this._graph.upsertNode({ id: row.id, label: 'Daemon', properties: row });
  }

  async _deleteNode(id) {
    await this._graph.deleteNode(id);
  }

  async _deleteEdge(id) {
    await this._graph.deleteEdge(id);
  }

  async rebuild() {
    const rebuildId = await startRebuild(CONSUMER_NAME, 0);
    try {
      const agents = await this._db.all('SELECT id, name, role, status, parent_agent_id FROM agents');
      for (const agent of agents) {
        await this._graph.upsertNode({ id: agent.id, label: 'Agent', properties: agent });
        if (agent.parent_agent_id) {
          await this._graph.upsertEdge({ id: `parent_${agent.id}`, source: agent.parent_agent_id, target: agent.id, label: 'PARENT_OF', properties: {} });
        }
      }
      const relations = await this._db.all('SELECT id, source_agent_id, target_agent_id, relation_type FROM agent_relations');
      for (const rel of relations) {
        await this._graph.upsertEdge({ id: rel.id, source: rel.source_agent_id, target: rel.target_agent_id, label: rel.relation_type || 'RELATION', properties: rel });
      }
      const lineage = await this._db.all('SELECT id, source_node_id, target_node_id, edge_type FROM lineage_edges');
      for (const edge of lineage) {
        await this._graph.upsertEdge({ id: edge.id, source: edge.source_node_id, target: edge.target_node_id, label: edge.edge_type || 'DESCENDS_FROM', properties: edge });
      }
      const synapses = await this._db.all('SELECT source_id, target_id, weight FROM memory_synapses');
      for (const syn of synapses) {
        await this._graph.upsertEdge({ id: `memory:${syn.source_id}:${syn.target_id}`, source: syn.source_id, target: syn.target_id, label: 'SYNAPSE', properties: syn });
      }
      const concepts = await this._db.all('SELECT id, source_id, target_id, relation_type FROM knowledge_graph_relations');
      for (const rel of concepts) {
        await this._graph.upsertEdge({ id: rel.id, source: rel.source_id, target: rel.target_id, label: rel.relation_type || 'RELATED_TO', properties: rel });
      }
      const territoryEdges = await this._db.all('SELECT id, source_id, target_id, relation FROM territory_graph_edges');
      for (const edge of territoryEdges) {
        await this._graph.upsertEdge({ id: edge.id, source: edge.source_id, target: edge.target_id, label: edge.relation || 'TERRITORY_EDGE', properties: edge });
      }
      const territoryNodes = await this._db.all('SELECT id, node_id, node_type FROM territory_graph_nodes');
      for (const node of territoryNodes) {
        await this._graph.upsertNode({ id: node.id, label: 'Daemon', properties: node });
      }
      await markConsumed(CONSUMER_NAME, 0);
      await completeRebuild(rebuildId, { toSequence: 0, status: 'completed' });
    } catch (error) {
      await completeRebuild(rebuildId, { toSequence: 0, status: 'failed', errorMessage: error.message });
      throw error;
    }
  }

  async retryFailures() {
    const failures = await getUnresolvedFailures(50);
    let retried = 0;
    for (const failure of failures) {
      try {
        const event = await this._db.get('SELECT * FROM projection_events WHERE event_id = ?', [failure.event_id]);
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
