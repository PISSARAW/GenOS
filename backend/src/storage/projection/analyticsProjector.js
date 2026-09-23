'use strict';

/**
 * Analytics Projector — consumes projection events and projects them into DuckDB.
 *
 * DuckDB is a rebuildable analytical projection. SQLite is canonical.
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

const CONSUMER_NAME = 'analytics';

class AnalyticsProjector {
  constructor(db) {
    this._db = db;
    this._store = null;
    this._running = false;
  }

  async init() {
    const { DuckDBStore } = require('../analytics/duckdbStore');
    try {
      this._store = new DuckDBStore();
      await this._store.init();
    } catch (_) {
      this._store = null;
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
        await markProjected(event.event_id, 'analytics');
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
        await this._deleteAgent(aggregate_id);
        break;
      case 'RELATION_ADDED':
      case 'RELATION_UPDATED':
        await this._upsertRelation(aggregate_id);
        break;
      case 'LINEAGE_ADDED':
      case 'LINEAGE_UPDATED':
        await this._upsertLineage(aggregate_id);
        break;
      case 'TELEMETRY_EVENT_RECORDED':
        await this._upsertTelemetry(aggregate_id);
        break;
      case 'EVALUATION_RUN_CREATED':
      case 'EVALUATION_RUN_UPDATED':
        await this._upsertEvaluation(aggregate_id);
        break;
      case 'UPLIFT_RUN_CREATED':
      case 'UPLIFT_RUN_UPDATED':
        await this._upsertUplift(aggregate_id);
        break;
      default:
        throw new Error(`UNSUPPORTED_EVENT: ${event_type}`);
    }
  }

  async _upsertAgent(id) {
    if (!this._store) return;
    const row = await this._db.get('SELECT id, name, role, status, created_at, updated_at FROM agents WHERE id = ?', id);
    if (!row) return;
    await this._store.exec(`CREATE TABLE IF NOT EXISTS agents (id VARCHAR PRIMARY KEY, name VARCHAR, role VARCHAR, status VARCHAR, created_at VARCHAR, updated_at VARCHAR)`);
    await this._store.all(`INSERT OR REPLACE INTO agents VALUES (?, ?, ?, ?, ?, ?)`,
      [row.id, row.name, row.role, row.status, row.created_at, row.updated_at]);
  }

  async _deleteAgent(id) {
    if (!this._store) return;
    await this._store.all(`DELETE FROM agents WHERE id = ?`, [id]);
  }

  async _upsertRelation(id) {
    if (!this._store) return;
    const row = await this._db.get('SELECT id, source_agent_id, target_agent_id, relation_type FROM agent_relations WHERE id = ?', id);
    if (!row) return;
    await this._store.exec(`CREATE TABLE IF NOT EXISTS agent_relations (id VARCHAR PRIMARY KEY, source_agent_id VARCHAR, target_agent_id VARCHAR, relation_type VARCHAR)`);
    await this._store.all(`INSERT OR REPLACE INTO agent_relations VALUES (?, ?, ?, ?)`,
      [row.id, row.source_agent_id, row.target_agent_id, row.relation_type]);
  }

  async _upsertLineage(id) {
    if (!this._store) return;
    const row = await this._db.get('SELECT id, source_node_id, target_node_id, edge_type FROM lineage_edges WHERE id = ?', id);
    if (!row) return;
    await this._store.exec(`CREATE TABLE IF NOT EXISTS lineage_edges (id VARCHAR PRIMARY KEY, source_node_id VARCHAR, target_node_id VARCHAR, edge_type VARCHAR)`);
    await this._store.all(`INSERT OR REPLACE INTO lineage_edges VALUES (?, ?, ?, ?)`,
      [row.id, row.source_node_id, row.target_node_id, row.edge_type]);
  }

  async _upsertTelemetry(id) {
    if (!this._store) return;
    const row = await this._db.get('SELECT id, agent_id, event_type, severity, created_at FROM telemetry_events WHERE id = ?', id);
    if (!row) return;
    await this._store.exec(`CREATE TABLE IF NOT EXISTS telemetry_events (id VARCHAR PRIMARY KEY, agent_id VARCHAR, event_type VARCHAR, severity VARCHAR, created_at VARCHAR)`);
    await this._store.all(`INSERT OR REPLACE INTO telemetry_events VALUES (?, ?, ?, ?, ?)`,
      [row.id, row.agent_id, row.event_type, row.severity, row.created_at]);
  }

  async _upsertEvaluation(id) {
    if (!this._store) return;
    const row = await this._db.get('SELECT id, benchmark, created_at FROM evaluation_runs WHERE id = ?', id);
    if (!row) return;
    await this._store.exec(`CREATE TABLE IF NOT EXISTS evaluation_runs (id VARCHAR PRIMARY KEY, benchmark VARCHAR, created_at VARCHAR)`);
    await this._store.all(`INSERT OR REPLACE INTO evaluation_runs VALUES (?, ?, ?)`,
      [row.id, row.benchmark, row.created_at]);
  }

  async _upsertUplift(id) {
    if (!this._store) return;
    const row = await this._db.get('SELECT id, suite, case_id, solo_run_id, genos_run_id, delta FROM uplift_runs WHERE id = ?', id);
    if (!row) return;
    await this._store.exec(`CREATE TABLE IF NOT EXISTS uplift_runs (id VARCHAR PRIMARY KEY, suite VARCHAR, case_id VARCHAR, solo_run_id VARCHAR, genos_run_id VARCHAR, delta DOUBLE)`);
    await this._store.all(`INSERT OR REPLACE INTO uplift_runs VALUES (?, ?, ?, ?, ?, ?)`,
      [row.id, row.suite, row.case_id, row.solo_run_id, row.genos_run_id, row.delta]);
  }

  async rebuild() {
    if (!this._store) await this.init();
    if (!this._store) throw new Error('Analytics store unavailable — SQLite remains canonical');
    const datasets = await this._store.materialize('operational');
    const checksum = await this._store.checksum();
    return { datasets, checksum };
  }

  async retryFailures() {
    const failures = await getUnresolvedFailures(50);
    let retried = 0;
    for (const failure of failures) {
      try {
        const event = await this._db.get('SELECT * FROM projection_events WHERE event_id = ?', [failure.event_id]);
        if (event) {
          await this._projectEvent(event);
          await markProjected(event.event_id, 'analytics');
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

module.exports = { AnalyticsProjector };
