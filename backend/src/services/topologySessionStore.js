'use strict';

const rhizomeStore = require('./rhizome/rhizomeStore');

/**
 * @file topologySessionStore.js
 * @description Durable store for topology sessions (Syncytium CRDT, Rhizome
 * stigmergy, Biome biofilm) so they survive process restarts and are shared between the
 * orchestrator process and the worker processes.
 */
async function ensureTable(db) {
  await db.run('CREATE TABLE IF NOT EXISTS topology_sessions (id TEXT PRIMARY KEY, topology TEXT NOT NULL, state_json TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  const columns = await db.all('PRAGMA table_info(topology_sessions)');
  if (Array.isArray(columns) && columns.length && !columns.some((column) => column.name === 'revision')) {
    await db.run('ALTER TABLE topology_sessions ADD COLUMN revision INTEGER NOT NULL DEFAULT 0');
  }
  await db.run(`CREATE TABLE IF NOT EXISTS topology_session_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    topology TEXT NOT NULL,
    revision INTEGER NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, revision)
  )`);
}

async function save(db, record) {
  await ensureTable(db);
  await db.run(
    `INSERT INTO topology_sessions (id, topology, state_json, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET topology = excluded.topology, state_json = excluded.state_json, updated_at = CURRENT_TIMESTAMP`,
    record.id, record.topology, JSON.stringify(record.state || {})
  );
  return record.id;
}
async function load(db, id) {
  await ensureTable(db);
  const row = await db.get('SELECT topology, state_json, revision FROM topology_sessions WHERE id = ?', id);
  if (!row) return null;
  let state = {};
  try { state = JSON.parse(row.state_json || '{}'); } catch (_) {}
  return { id, topology: row.topology, revision: Number(row.revision) || 0, state };
}

async function createRhizome(db, record, event) {
  return withTransaction(db, async () => {
    await ensureTable(db);
    await rhizomeStore.ensureGraphTables(db);
    await db.run(
      'INSERT INTO topology_sessions (id, topology, state_json, revision, updated_at) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)',
      record.id, 'rhizome', JSON.stringify(record.state || {})
    );
    if (record.graph?.nodes?.length || record.graph?.edges?.length) {
      await rhizomeStore.replaceGraph(db, record.id, record.graph);
    }
    await appendEvent(db, { sessionId: record.id, revision: 1, ...event });
    return { id: record.id, revision: 1 };
  });
}

async function mutateRhizome(db, id, mutator) {
  return withTransaction(db, async () => {
    await ensureTable(db);
    const record = await load(db, id);
    if (!record || record.topology !== 'rhizome') {
      throw Object.assign(new Error(`Unknown rhizome session '${id}'.`), { code: 'RHIZOME_SESSION_UNKNOWN' });
    }
    const change = await mutator(record);
    const revision = record.revision + 1;
    const result = await db.run(
      `UPDATE topology_sessions SET state_json = ?, revision = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND topology = 'rhizome' AND revision = ?`,
      JSON.stringify(change.state), revision, id, record.revision
    );
    if (result.changes !== 1) {
      throw Object.assign(new Error(`Rhizome session revision conflict for '${id}'.`), { code: 'RHIZOME_SESSION_CONFLICT' });
    }
    if (change.graph) await rhizomeStore.replaceGraph(db, id, change.graph);
    await appendEvent(db, { sessionId: id, revision, ...change.event });
    return { ...change.result, revision };
  });
}

async function appendEvent(db, event) {
  await db.run(
    `INSERT INTO topology_session_events (session_id, topology, revision, event_type, payload_json)
     VALUES (?, ?, ?, ?, ?)`,
    event.sessionId, 'rhizome', event.revision, event.type, JSON.stringify(event.payload || {})
  );
}

async function closeRhizome(db, id) {
  return withTransaction(db, async () => {
    const record = await load(db, id);
    if (!record || record.topology !== 'rhizome') return false;
    await appendEvent(db, { sessionId: id, revision: record.revision + 1, type: 'SESSION_CLOSED', payload: {} });
    const removed = await db.run('DELETE FROM topology_sessions WHERE id = ? AND revision = ?', id, record.revision);
    if (removed.changes !== 1) {
      throw Object.assign(new Error(`Rhizome session revision conflict for '${id}'.`), { code: 'RHIZOME_SESSION_CONFLICT' });
    }
    await rhizomeStore.deleteGraph(db, id);
    return true;
  });
}

async function events(db, sessionId) {
  await ensureTable(db);
  const rows = await db.all(
    `SELECT revision, event_type, payload_json, created_at FROM topology_session_events
     WHERE session_id = ? ORDER BY revision`, sessionId
  );
  return rows.map((row) => ({
    revision: row.revision,
    type: row.event_type,
    payload: parseJson(row.payload_json),
    createdAt: row.created_at
  }));
}

function parseJson(value) {
  try { return JSON.parse(value || '{}'); } catch (_) { return {}; }
}

async function withTransaction(db, callback) {
  return require('../db').withTransaction(db, callback);
}

async function remove(db, id) {
  await ensureTable(db);
  return db.run('DELETE FROM topology_sessions WHERE id = ?', id);
}

module.exports = { save, load, remove, ensureTable, createRhizome, mutateRhizome, closeRhizome, events, loadRhizomeGraph: rhizomeStore.loadGraph };
