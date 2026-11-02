'use strict';

const fs = require('node:fs');
const { NervousStore } = require('./store');
const { NervousRuntime } = require('./runtime');
const { scopeOf } = require('./contract');

function rowEvent(row) {
  const timestamp = row.created_at.includes('T') ? row.created_at : `${row.created_at.replace(' ', 'T')}Z`;
  return { id: row.event_id, agentId: row.agent_id, eventType: row.event_type,
    severity: row.severity, timestamp, payload: JSON.parse(row.payload_json || '{}') };
}

async function sourceDatabasePath(sourceDb) {
  const rows = await sourceDb.all('PRAGMA database_list');
  const filename = rows.find(row => row.name === 'main')?.file;
  if (!filename) throw new Error('DURABLE_DATABASE_REQUIRED');
  return filename;
}

async function openRuntime(sourceDb) {
  const filename = await sourceDatabasePath(sourceDb);
  const sidecar = `${filename}.nervous.sqlite`;
  if (fs.existsSync(sidecar) && fs.lstatSync(sidecar).isSymbolicLink()) throw new Error('UNSAFE_SIDECAR');
  const fd = fs.openSync(sidecar, fs.constants.O_CREAT | fs.constants.O_RDWR | (fs.constants.O_NOFOLLOW || 0), 0o600);
  fs.closeSync(fd);
  const { open } = require('sqlite');
  const db = await open({ filename: sidecar, driver: require('sqlite3').Database });
  try {
    const store = await new NervousStore(db).initialize();
    return new NervousRuntime(store);
  } catch (error) { await db.close(); throw error; }
}

class RuntimeBridge {
  constructor(options = {}) {
    this.enabled = options.enabled || (() => process.env.GENOS_NERVOUS_ENABLED === '1');
    this.open = options.openRuntime || openRuntime;
    this.runtimes = new Map();
    this.pending = 0;
    this.stats = { observed: 0, failures: 0, backpressure: 0 };
  }

  getRuntime(db) {
    if (!this.runtimes.has(db)) {
      if (this.runtimes.size >= 8) throw new Error('RUNTIME_CAPACITY');
      const opening = Promise.resolve().then(() => this.open(db)).catch(error => {
        this.runtimes.delete(db);
        throw error;
      });
      this.runtimes.set(db, opening);
    }
    return this.runtimes.get(db);
  }

  async observePersistedEvent(db, event) {
    if (!this.enabled()) return { status: 'DISABLED' };
    if (this.pending >= 64) { this.stats.backpressure += 1; return { status: 'BACKPRESSURE' }; }
    this.pending += 1;
    try {
      return await this.observeRow(db, event);
    } catch (_) {
      this.stats.failures += 1;
      return { status: 'UNAVAILABLE', recovery: 'BACKFILL_REQUIRED' };
    } finally { this.pending -= 1; }
  }

  async observeRow(db, event) {
    const payload = event.payload || {};
    const scope = scopeOf({ organizationId: payload.organizationId ?? payload.organization_id,
      projectId: payload.projectId ?? payload.project_id });
    const row = await db.get(`SELECT event_id,agent_id,event_type,severity,payload_json,created_at
      FROM telemetry_events WHERE event_id=? AND organization_id=? AND project_id=?`,
    event.id, scope.organizationId, scope.projectId);
    if (!row) return { status: 'NOT_PERSISTED' };
    const runtime = await this.getRuntime(db);
    const canonical = rowEvent(row);
    const graph = await require('./graphContext').loadGraph({ db, event: canonical, scope });
    const result = await runtime.ingest(canonical, scope, { graph });
    this.stats.observed += 1;
    return { status: 'OBSERVED', ...result };
  }

  async backfill(db, request) {
    if (!this.enabled()) return { status: 'DISABLED' };
    const scope = scopeOf(request.scope);
    const afterId = request.afterId ?? 0;
    const limit = request.limit ?? 100;
    if (!Number.isSafeInteger(afterId) || afterId < 0) throw new TypeError('Invalid cursor');
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new TypeError('Invalid limit');
    const rows = await db.all(`SELECT id,event_id,payload_json FROM telemetry_events
      WHERE organization_id=? AND project_id=? AND id>? ORDER BY id LIMIT ?`,
    scope.organizationId, scope.projectId, afterId, limit);
    return this.backfillRows(db, rows, afterId);
  }

  async backfillRows(db, rows, afterId) {
    let cursor = afterId;
    for (const row of rows) {
      const result = await this.observePersistedEvent(db, { id: row.event_id,
        payload: JSON.parse(row.payload_json || '{}') });
      if (result.status !== 'OBSERVED') return { ...result, afterId: cursor };
      cursor = row.id;
    }
    return { status: 'BACKFILLED', afterId: cursor, scanned: rows.length };
  }

  async shutdown() {
    if (this.pending !== 0) throw new Error('DRAIN_BEFORE_SHUTDOWN');
    const runtimes = await Promise.all(this.runtimes.values());
    await Promise.all(runtimes.map(runtime => runtime.store.close()));
    this.runtimes.clear();
  }
}

const bridge = new RuntimeBridge();
module.exports = bridge;
module.exports.RuntimeBridge = RuntimeBridge;
module.exports.rowEvent = rowEvent;
module.exports.sourceDatabasePath = sourceDatabasePath;
