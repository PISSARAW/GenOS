'use strict';

const { DatabaseSync } = require('node:sqlite');
const { NervousStore } = require('../../src/services/nervous/store');
const { NervousRuntime } = require('../../src/services/nervous/runtime');
const NOW = Date.parse('2026-11-02T12:00:00.000Z');
const SCOPE = Object.freeze({ organizationId: 'org-a', projectId: 'project-a' });

function connection(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  return {
    async exec(sql) { db.exec(sql); },
    async run(sql, ...params) { return db.prepare(sql).run(...params); },
    async get(sql, ...params) { return db.prepare(sql).get(...params); },
    async all(sql, ...params) { return db.prepare(sql).all(...params); },
    async close() { db.close(); }
  };
}

async function harness(options = {}) {
  const db = connection(options.filename);
  const store = await new NervousStore(db, { maxSignals: options.maxSignals }).initialize();
  const time = { now: NOW };
  const runtime = new NervousRuntime(store, { clock: () => time.now });
  return { db, store, runtime, time };
}

function event(id, options = {}) {
  return { id, agentId: 'worker-a', eventType: 'NERVOUS_RESOURCE_SAMPLE', severity: 'info',
    timestamp: new Date(NOW).toISOString(), ...options,
    payload: { ...SCOPE, ...options.payload } };
}

async function telemetryDatabase() {
  const db = connection();
  await db.exec(`CREATE TABLE telemetry_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,event_id TEXT UNIQUE,session_id TEXT,agent_id TEXT,
    event_type TEXT,action TEXT,detail TEXT,payload_json TEXT,severity TEXT,
    organization_id TEXT,project_id TEXT,created_at TEXT DEFAULT '2026-11-02 12:00:00');
    CREATE TABLE provenance_records(id TEXT PRIMARY KEY,subject_type TEXT,subject_id TEXT,
    payload_hash TEXT,payload_json TEXT,organization_id TEXT,project_id TEXT);`);
  return db;
}

async function saveTelemetry(db, item) {
  await db.run(`INSERT INTO telemetry_events
    (event_id,agent_id,event_type,severity,payload_json,organization_id,project_id) VALUES(?,?,?,?,?,?,?)`,
  item.id, item.agentId, item.eventType, item.severity, JSON.stringify(item.payload),
  item.payload.organizationId, item.payload.projectId);
}

module.exports = { NOW, SCOPE, connection, harness, event, telemetryDatabase, saveTelemetry };
