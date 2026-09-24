'use strict';

const { withTransaction } = require('../../db');

async function ensureTables(db) {
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

async function create(db, session) {
  await ensureTables(db);
  const result = await db.run(
    `INSERT INTO topology_sessions (id, topology, state_json, revision, updated_at)
     VALUES (?, 'biome', ?, 0, CURRENT_TIMESTAMP) ON CONFLICT(id) DO NOTHING`,
    session.id, JSON.stringify(session.state || {})
  );
  if (result.changes !== 1) throw conflict(session.id);
  return { id: session.id, revision: 0 };
}

async function load(db, id) {
  await ensureTables(db);
  const row = await db.get('SELECT topology, state_json, revision FROM topology_sessions WHERE id = ?', id);
  if (!row || row.topology !== 'biome') return null;
  return { id, topology: row.topology, revision: Number(row.revision) || 0, state: parseState(row.state_json) };
}

async function mutate(options) {
  return withTransaction(options.db, async (db) => {
    await ensureTables(db);
    const record = await load(db, options.id);
    if (!record) throw Object.assign(new Error(`Unknown biome session '${options.id}'.`), { code: 'BIOME_SESSION_UNKNOWN' });
    const change = await options.mutator(record);
    const revision = record.revision + 1;
    const updated = await db.run(
      `UPDATE topology_sessions SET state_json = ?, revision = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND topology = 'biome' AND revision = ?`,
      JSON.stringify(change.state), revision, options.id, record.revision
    );
    if (updated.changes !== 1) throw conflict(options.id);
    await db.run(
      `INSERT INTO topology_session_events (session_id, topology, revision, event_type, payload_json)
       VALUES (?, 'biome', ?, ?, ?)`,
      options.id, revision, options.operation, JSON.stringify({ actorId: options.actorId || 'system', ...change.event })
    );
    return { ...change.result, revision };
  });
}

function parseState(value) {
  try { return JSON.parse(value || '{}'); } catch (_) { return {}; }
}

function conflict(id) {
  return Object.assign(new Error(`Biome session revision conflict for '${id}'.`), { code: 'BIOME_SESSION_CONFLICT' });
}

module.exports = { ensureTables, create, load, mutate };
