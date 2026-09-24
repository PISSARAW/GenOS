'use strict';

const { withTransaction } = require('../db');

async function ensureTables(db) {
  await db.run('CREATE TABLE IF NOT EXISTS topology_sessions (id TEXT PRIMARY KEY, topology TEXT NOT NULL, state_json TEXT NOT NULL, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  await db.run('CREATE TABLE IF NOT EXISTS syncytium_session_revisions (session_id TEXT PRIMARY KEY, revision INTEGER NOT NULL)');
  await db.run('CREATE TABLE IF NOT EXISTS syncytium_applied_ops (session_id TEXT NOT NULL, op_id TEXT NOT NULL, operation_json TEXT NOT NULL, PRIMARY KEY (session_id, op_id))');
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

async function createSession(db, session) {
  return withTransaction(db, async (tx) => {
    await ensureTables(tx);
    await tx.run('INSERT INTO topology_sessions (id, topology, state_json, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)', session.sessionId, 'syncytium', JSON.stringify(session.state));
    await tx.run('INSERT INTO syncytium_session_revisions (session_id, revision) VALUES (?, 0)', session.sessionId);
    await appendEvent(tx, { session, revision: 0, type: 'SESSION_CREATED' });
    return 0;
  });
}

async function commitSession(db, session, operation) {
  return withTransaction(db, async (tx) => {
    await ensureTables(tx);
    const operations = normalizeOperations(operation);
    const duplicateCount = await countExistingOperations(tx, session.sessionId, operations);
    if (duplicateCount === operations.length && operations.length) return { revision: await getRevision(tx, session.sessionId), duplicate: true };
    if (duplicateCount) throw transactionDuplicateConflict(session.sessionId);
    const revision = session.revision + 1;
    const compare = await tx.run('UPDATE syncytium_session_revisions SET revision = ? WHERE session_id = ? AND revision = ?', revision, session.sessionId, session.revision);
    if (compare.changes !== 1) throw revisionConflict(session.sessionId, session.revision);
    const update = await tx.run("UPDATE topology_sessions SET state_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND topology = 'syncytium'", JSON.stringify(session.state), session.sessionId);
    if (update.changes !== 1) throw missingSession(session.sessionId);
    for (const item of operations) await recordOperation(tx, session, item);
    await appendSessionEvent({ db: tx, session, revision, operations });
    return { revision, duplicate: false };
  });
}

async function appendSessionEvent({ db, session, revision, operations }) {
  const reflex = session.pendingReflexSignal;
  const payload = eventPayload(reflex, operations);
  await appendEvent(db, { session, revision, type: eventType(reflex, operations), payload });
}

function eventPayload(reflex, operations) {
  if (reflex) return reflex;
  return isGroupedOperations(operations) ? { operations } : operations[0];
}

function eventType(reflex, operations) {
  if (reflex) return 'REFLEX_SIGNAL';
  return isGroupedOperations(operations) ? 'TRANSACTION_COMMITTED' : 'OPERATION_APPLIED';
}

function isGroupedOperations(operations) {
  return operations.length > 1 || operations.some((item) => item.transactionId);
}

function normalizeOperations(operation) {
  if (Array.isArray(operation)) return operation;
  return operation ? [operation] : [];
}

async function countExistingOperations(db, sessionId, operations) {
  let duplicates = 0;
  for (const operation of operations) {
    if (operation.opId && await hasOperation(db, sessionId, operation.opId)) duplicates += 1;
  }
  return duplicates;
}

async function loadSession(db, sessionId) {
  await ensureTables(db);
  const row = await db.get("SELECT topology, state_json FROM topology_sessions WHERE id = ? AND topology = 'syncytium'", sessionId);
  if (!row) return null;
  return { id: sessionId, topology: row.topology, state: JSON.parse(row.state_json || '{}'), revision: await getRevision(db, sessionId) };
}

async function getRevision(db, sessionId) {
  const row = await db.get('SELECT revision FROM syncytium_session_revisions WHERE session_id = ?', sessionId);
  return Number(row?.revision) || 0;
}

async function hasOperation(db, sessionId, opId) {
  return Boolean(await db.get('SELECT op_id FROM syncytium_applied_ops WHERE session_id = ? AND op_id = ?', sessionId, opId));
}

async function recordOperation(db, session, operation) {
  await db.run('INSERT INTO syncytium_applied_ops (session_id, op_id, operation_json) VALUES (?, ?, ?)', session.sessionId, operation.opId, JSON.stringify(operation));
}

async function appendEvent(db, event) {
  await db.run('INSERT INTO topology_session_events (session_id, topology, revision, event_type, payload_json) VALUES (?, ?, ?, ?, ?)', event.session.sessionId, 'syncytium', event.revision, event.type, JSON.stringify(event.payload || {}));
}

async function loadEvents(db, sessionId) {
  await ensureTables(db);
  const rows = await db.all('SELECT revision, event_type, payload_json FROM topology_session_events WHERE session_id = ? AND topology = \'syncytium\' ORDER BY revision', sessionId);
  return rows.map((row) => ({ revision: row.revision, type: row.event_type, payload: JSON.parse(row.payload_json || '{}') }));
}

async function removeSession(db, sessionId) {
  return withTransaction(db, async (tx) => {
    await ensureTables(tx);
    await tx.run('DELETE FROM syncytium_applied_ops WHERE session_id = ?', sessionId);
    await tx.run('DELETE FROM topology_session_events WHERE session_id = ? AND topology = \'syncytium\'', sessionId);
    await tx.run('DELETE FROM syncytium_session_revisions WHERE session_id = ?', sessionId);
    return tx.run("DELETE FROM topology_sessions WHERE id = ? AND topology = 'syncytium'", sessionId);
  });
}

function missingSession(sessionId) {
  return Object.assign(new Error(`Unknown Syncytium session '${sessionId}'.`), { code: 'SYNCYTIUM_SESSION_UNKNOWN' });
}

function revisionConflict(sessionId, revision) {
  return Object.assign(new Error(`Syncytium session '${sessionId}' changed from revision ${revision}.`), { code: 'SYNCYTIUM_SESSION_CONFLICT' });
}

function transactionDuplicateConflict(sessionId) {
  return Object.assign(new Error(`Syncytium transaction for '${sessionId}' is only partially duplicated.`), { code: 'SYNCYTIUM_TRANSACTION_PARTIAL_DUPLICATE' });
}

module.exports = { createSession, commitSession, loadSession, loadEvents, removeSession };
