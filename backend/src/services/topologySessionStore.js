'use strict';

/**
 * @file topologySessionStore.js
 * @description Durable store for topology sessions (Syncytium CRDT, Rhizome
 * stigmergy, Biome biofilm) so they survive process restarts and are shared between the
 * orchestrator process and the worker processes.
 */
async function ensureTable(db) {
  await db.run('CREATE TABLE IF NOT EXISTS topology_sessions (id TEXT PRIMARY KEY, topology TEXT NOT NULL, state_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  const columns = await db.all('PRAGMA table_info(topology_sessions)');
  if (!columns.some((column) => column.name === 'version')) {
    try { await db.run('ALTER TABLE topology_sessions ADD COLUMN version INTEGER NOT NULL DEFAULT 0'); }
    catch (error) { if (!/duplicate column/i.test(error.message || '')) throw error; }
  }
}

async function save(db, record) {
  await ensureTable(db);
  const stateJson = JSON.stringify(record.state || {});
  const result = record.expectedVersion === undefined
    ? await db.run(`INSERT INTO topology_sessions (id, topology, state_json, version, updated_at) VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET topology = excluded.topology, state_json = excluded.state_json, version = topology_sessions.version + 1, updated_at = CURRENT_TIMESTAMP`, record.id, record.topology, stateJson)
    : await db.run(`INSERT INTO topology_sessions (id, topology, state_json, version, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET topology = excluded.topology, state_json = excluded.state_json, version = excluded.version, updated_at = CURRENT_TIMESTAMP
        WHERE topology_sessions.version = ?`, record.id, record.topology, stateJson, record.expectedVersion + 1, record.expectedVersion);
  if (record.expectedVersion !== undefined && result.changes !== 1) {
    throw Object.assign(new Error(`Topology session '${record.id}' changed concurrently.`), { code: 'TOPOLOGY_SESSION_VERSION_CONFLICT' });
  }
  return record.id;
}

async function load(db, id) {
  await ensureTable(db);
  const row = await db.get('SELECT topology, state_json, version FROM topology_sessions WHERE id = ?', id);
  if (!row) return null;
  let state = {};
  try { state = JSON.parse(row.state_json || '{}'); } catch (_) {}
  return { id, topology: row.topology, state, storeVersion: Number(row.version) || 0 };
}

async function remove(db, id) {
  await ensureTable(db);
  return db.run('DELETE FROM topology_sessions WHERE id = ?', id);
}

module.exports = { save, load, remove, ensureTable };
