'use strict';

/**
 * @file topologySessionStore.js
 * @description Durable store for topology sessions (Syncytium CRDT, Rhizome
 * stigmergy, Biome biofilm) so they survive process restarts and are shared between the
 * orchestrator process and the worker processes.
 */
async function ensureTable(db) {
  await db.run('CREATE TABLE IF NOT EXISTS topology_sessions (id TEXT PRIMARY KEY, topology TEXT NOT NULL, state_json TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
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
  const row = await db.get('SELECT topology, state_json FROM topology_sessions WHERE id = ?', id);
  if (!row) return null;
  let state = {};
  try { state = JSON.parse(row.state_json || '{}'); } catch (_) {}
  return { id, topology: row.topology, state };
}

async function remove(db, id) {
  await ensureTable(db);
  return db.run('DELETE FROM topology_sessions WHERE id = ?', id);
}

module.exports = { save, load, remove, ensureTable };
