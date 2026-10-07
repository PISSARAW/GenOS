'use strict';

const { randomUUID, createHash } = require('node:crypto');
const { pack, unpack } = require('msgpackr');

async function ensureSchema(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS cognitive_visibility_sessions (
    session_id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0,
    model TEXT, model_version TEXT, context_revision TEXT, valid INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ); CREATE TABLE IF NOT EXISTS cognitive_visibility_fragments (
    session_id TEXT NOT NULL, object_id TEXT NOT NULL, object_digest TEXT NOT NULL,
    value_blob BLOB NOT NULL, scope TEXT, expires_at DATETIME, revision INTEGER NOT NULL,
    valid INTEGER NOT NULL DEFAULT 1, invalidated_at DATETIME,
    PRIMARY KEY (session_id, object_id), FOREIGN KEY (session_id) REFERENCES cognitive_visibility_sessions(session_id)
  ); CREATE TABLE IF NOT EXISTS cognitive_visibility_events (
    event_id TEXT PRIMARY KEY, session_id TEXT NOT NULL, event_type TEXT NOT NULL,
    revision INTEGER NOT NULL, payload_blob BLOB NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ); CREATE INDEX IF NOT EXISTS idx_cognitive_visibility_fragments_expiry
    ON cognitive_visibility_fragments(session_id, expires_at, valid);`);
}

function digest(value) { return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`; }

async function event(db, sessionId, { type, revision, payload } = {}) {
  await db.run(`INSERT INTO cognitive_visibility_events
    (event_id, session_id, event_type, revision, payload_blob) VALUES (?, ?, ?, ?, ?)`,
  [randomUUID(), sessionId, type, revision, pack(payload || {})]);
}

async function openSession(db, input = {}) {
  await ensureSchema(db);
  if (!input.sessionId) throw new Error('visibility_session_required');
  let row = await db.get('SELECT * FROM cognitive_visibility_sessions WHERE session_id = ?', input.sessionId);
  if (!row) {
    await db.run(`INSERT INTO cognitive_visibility_sessions
      (session_id, model, model_version, context_revision) VALUES (?, ?, ?, ?)`,
    [input.sessionId, input.model || null, input.modelVersion || null, input.contextRevision || null]);
    row = await db.get('SELECT * FROM cognitive_visibility_sessions WHERE session_id = ?', input.sessionId);
    await event(db, input.sessionId, { type: 'session_opened', revision: row.revision, payload: input });
    return row;
  }
  const changed = openSessionChanged(input, row);
  if (changed) {
    await invalidate(db, { sessionId: input.sessionId, reason: 'session_context_changed' });
    row = await db.get('SELECT * FROM cognitive_visibility_sessions WHERE session_id = ?', input.sessionId);
    await db.run(`UPDATE cognitive_visibility_sessions SET model = ?, model_version = ?, context_revision = ?,
      valid = 1, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?`,
    [input.model ?? row.model, input.modelVersion ?? row.model_version,
      input.contextRevision ?? row.context_revision, input.sessionId]);
    row = await db.get('SELECT * FROM cognitive_visibility_sessions WHERE session_id = ?', input.sessionId);
    await event(db, input.sessionId, { type: 'session_context_changed', revision: row.revision, payload: input });
  }
  return row;
}

async function materialize(db, input = {}) {
  const session = await openSession(db, input);
  if (!input.objectId) throw new Error('visibility_object_required');
  await db.run(`INSERT INTO cognitive_visibility_fragments
    (session_id, object_id, object_digest, value_blob, scope, expires_at, revision, valid)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(session_id, object_id) DO UPDATE SET object_digest = excluded.object_digest,
      value_blob = excluded.value_blob, scope = excluded.scope, expires_at = excluded.expires_at,
      revision = excluded.revision, valid = 1, invalidated_at = NULL`,
  [input.sessionId, input.objectId, digest(input.value), pack(input.value), input.scope || null,
    input.expiresAt || null, session.revision]);
  await event(db, input.sessionId, { type: 'fragment_materialized', revision: session.revision, payload: { objectId: input.objectId, scope: input.scope || null } });
  return { sessionId: input.sessionId, objectId: input.objectId, revision: session.revision,
    mode: 'materialized_in_session' };
}

async function invalidate(db, input = {}) {
  await ensureSchema(db);
  const session = await db.get('SELECT * FROM cognitive_visibility_sessions WHERE session_id = ?', input.sessionId);
  if (!session) throw new Error('visibility_session_missing');
  const revision = session.revision + 1;
  const ids = Array.isArray(input.objectIds) ? input.objectIds : [];
  const clause = ids.length ? `AND object_id IN (${ids.map(() => '?').join(',')})` : '';
  await db.run(`UPDATE cognitive_visibility_fragments SET valid = 0, invalidated_at = CURRENT_TIMESTAMP
    WHERE session_id = ? ${clause}`, [input.sessionId, ...ids]);
  await db.run(`UPDATE cognitive_visibility_sessions SET revision = ?, updated_at = CURRENT_TIMESTAMP WHERE session_id = ?`,
    [revision, input.sessionId]);
  await event(db, input.sessionId, { type: input.reason === 'compaction' ? 'compacted' : 'invalidated', revision: revision, payload: { objectIds: ids, reason: input.reason || 'explicit' } });
  return { sessionId: input.sessionId, revision, invalidated: ids };
}

async function compact(db, input = {}) {
  const session = await openSession(db, input);
  const retained = Array.isArray(input.retainedObjectIds) ? input.retainedObjectIds : [];
  const rows = await db.all('SELECT object_id FROM cognitive_visibility_fragments WHERE session_id = ? AND valid = 1', input.sessionId);
  const invalidated = rows.map((row) => row.object_id).filter((id) => !retained.includes(id));
  if (!invalidated.length) return { sessionId: input.sessionId, revision: session.revision, invalidated: [] };
  return invalidate(db, { sessionId: input.sessionId, objectIds: invalidated, reason: 'compaction' });
}

async function visible(db, input = {}) {
  await ensureSchema(db);
  await expire(db, input.sessionId);
  const row = await db.get(`SELECT s.revision, f.* FROM cognitive_visibility_sessions s
    JOIN cognitive_visibility_fragments f ON f.session_id = s.session_id
    WHERE s.session_id = ? AND f.object_id = ? AND s.valid = 1 AND f.valid = 1
      AND f.scope IS ?`, [input.sessionId, input.objectId, input.scope ?? null]);
  if (!row) return { visible: false, revision: null, value: undefined };
  const value = unpack(row.value_blob);
  if (digest(value) !== row.object_digest) throw new Error('visibility_object_digest_mismatch');
  return { visible: true, revision: row.revision, value, scope: row.scope };
}

async function expire(db, sessionId) {
  const rows = await db.all(`SELECT object_id FROM cognitive_visibility_fragments
    WHERE session_id = ? AND valid = 1 AND expires_at IS NOT NULL
    AND (julianday(expires_at) IS NULL OR julianday(expires_at) <= julianday('now'))`, sessionId);
  if (rows.length) await invalidate(db, { sessionId,
    objectIds: rows.map((row) => row.object_id), reason: 'expired' });
}

async function recover(db, sessionId) {
  await ensureSchema(db);
  await expire(db, sessionId);
  const session = await db.get('SELECT * FROM cognitive_visibility_sessions WHERE session_id = ?', sessionId);
  if (!session) return null;
  const fragments = await db.all(`SELECT object_id, object_digest, scope, revision, expires_at FROM
    cognitive_visibility_fragments WHERE session_id = ? AND valid = 1
    ORDER BY object_id`, sessionId);
  return { session, fragments };
}

module.exports = { ensureSchema, openSession, materialize, invalidate, compact, visible, recover };

function openSessionChanged(input, row) {
  return (input.model !== undefined && input.model !== null && input.model !== row.model)
    || (input.modelVersion !== undefined && input.modelVersion !== null && input.modelVersion !== row.model_version)
    || (input.contextRevision !== undefined && input.contextRevision !== null
      && input.contextRevision !== row.context_revision);
}
