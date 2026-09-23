'use strict';

/**
 * Search Projector — consumes projection events and projects them into the search index.
 *
 * Primary: FTS5 + sqlite-vec (already maintained by triggers in schema.js)
 * Optional: LanceDB (promoted only when benchmarks prove it necessary)
 *
 * The projector re-reads canonical rows from SQLite.
 */

const {
  getUnconsumedEvents,
  markConsumed,
  markProjected,
  recordProjectionFailure,
  getUnresolvedFailures,
  resolveFailure,
} = require('./projectionOutbox');

const CONSUMER_NAME = 'search';

class SearchProjector {
  constructor(db) {
    this._db = db;
    this._running = false;
  }

  async init() {
    await this.ensureIndexes();
    return this;
  }

  async ensureIndexes() {
    const stmts = [
      `CREATE VIRTUAL TABLE IF NOT EXISTS agents_fts USING fts5(id UNINDEXED, name, role, status, content)`,
      `CREATE VIRTUAL TABLE IF NOT EXISTS concepts_fts USING fts5(id UNINDEXED, content)`,
      `CREATE VIRTUAL TABLE IF NOT EXISTS synapses_fts USING fts5(id UNINDEXED, content)`,
    ];
    const fallbacks = [
      `CREATE TABLE IF NOT EXISTS agents_fts (id TEXT PRIMARY KEY, name TEXT, role TEXT, status TEXT, content TEXT)`,
      `CREATE TABLE IF NOT EXISTS concepts_fts (id TEXT PRIMARY KEY, content TEXT)`,
      `CREATE TABLE IF NOT EXISTS synapses_fts (id TEXT PRIMARY KEY, content TEXT)`,
    ];
    for (let i = 0; i < stmts.length; i++) {
      try {
        await this._db.exec(stmts[i]);
      } catch (_) {
        await this._db.exec(fallbacks[i]);
      }
    }
  }

  async processBatch(limit = 100) {
    const { events, lastSequence } = await getUnconsumedEvents(CONSUMER_NAME, limit);
    if (!events.length) return 0;
    let processed = 0;
    for (const event of events) {
      try {
        await this._projectEvent(event);
        await markProjected(event.event_id, 'search');
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
        await this._upsertAgentSearch(aggregate_id);
        break;
      case 'AGENT_REMOVED':
        await this._deleteAgentSearch(aggregate_id);
        break;
      case 'CONCEPT_RELATION_ADDED':
      case 'CONCEPT_RELATION_UPDATED':
        await this._upsertConceptSearch(aggregate_id);
        break;
      case 'SYNAPSE_ADDED':
      case 'SYNAPSE_UPDATED':
        await this._upsertSynapseSearch(aggregate_id);
        break;
      default:
        throw new Error(`UNSUPPORTED_EVENT: ${event_type}`);
    }
  }

  async _upsertAgentSearch(id) {
    const row = await this._db.get('SELECT id, name, role, status, current_task FROM agents WHERE id = ?', id);
    if (!row) return;
    // FTS5 agents index
    await this._db.run(
      `INSERT OR REPLACE INTO agents_fts (id, name, role, status, content) VALUES (?, ?, ?, ?, ?)`,
      [row.id, row.name, row.role, row.status, row.current_task || '']
    );
  }

  async _deleteAgentSearch(id) {
    await this._db.run('DELETE FROM agents_fts WHERE id = ?', [id]);
  }

  async _upsertConceptSearch(id) {
    const row = await this._db.get('SELECT id, source_id, target_id, relation_type FROM knowledge_graph_relations WHERE id = ?', id);
    if (!row) return;
    await this._db.run(
      `INSERT OR REPLACE INTO concepts_fts (id, content) VALUES (?, ?)`,
      [row.id, `${row.source_id} ${row.target_id} ${row.relation_type}`]
    );
  }

  async _upsertSynapseSearch(id) {
    const key = String(id || '').split(':');
    if (key.length < 3 || key[0] !== 'memory') return;
    const sourceId = key[1];
    const targetId = key.slice(2).join(':');
    const row = await this._db.get('SELECT source_id, target_id, weight FROM memory_synapses WHERE source_id = ? AND target_id = ?', [sourceId, targetId]);
    if (!row) return;
    await this._db.run(
      `INSERT OR REPLACE INTO synapses_fts (id, content) VALUES (?, ?)`,
      [id, `${row.source_id} ${row.target_id} weight:${row.weight}`]
    );
  }

  async rebuild() {
    await this.ensureIndexes();
    const crypto = require('crypto');
    const counts = {};
    try {
      const agents = await this._db.all('SELECT id, name, role, status FROM agents');
      for (const a of agents) {
        await this._upsertAgentSearch(a.id);
      }
      counts.agents = agents.length;
    } catch (_) { counts.agents = null; }
    const checksum = crypto.createHash('sha256').update(JSON.stringify(counts)).digest('hex');
    return { counts, checksum };
  }

  async retryFailures() {
    const failures = await getUnresolvedFailures(50);
    let retried = 0;
    for (const failure of failures) {
      try {
        const event = await this._db.get('SELECT * FROM projection_events WHERE event_id = ?', [failure.event_id]);
        if (event) {
          await this._projectEvent(event);
          await markProjected(event.event_id, 'search');
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

module.exports = { SearchProjector };
