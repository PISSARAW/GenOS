'use strict';

const crypto = require('node:crypto');
const initialized = new WeakMap();
const clone = (value) => structuredClone(value);
const hash = (value) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const error = (code) => Object.assign(new Error(code), { code });

function transaction(db, callback) { return require('../db').withTransaction(db, callback); }

async function ensure(db) {
  if (!db?.exec) throw error('AXOLOTL_DATABASE_REQUIRED');
  if (!initialized.has(db)) initialized.set(db, db.exec(`
    CREATE TABLE IF NOT EXISTS axolotl_state (
      kind TEXT NOT NULL, id TEXT NOT NULL, version INTEGER NOT NULL,
      payload_json TEXT NOT NULL, PRIMARY KEY(kind, id));
    CREATE TABLE IF NOT EXISTS axolotl_evidence (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, subject_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL, created_at TEXT NOT NULL);
  `).catch((failure) => { initialized.delete(db); throw failure; }));
  await initialized.get(db);
}

async function read(db, key) {
  await ensure(db);
  const row = await db.get('SELECT version, payload_json FROM axolotl_state WHERE kind = ? AND id = ?', key.kind, key.id);
  return row ? { ...JSON.parse(row.payload_json), version: row.version } : null;
}

async function write(db, entry) {
  const { kind, id, value, expectedVersion = 0 } = entry;
  const next = { ...value, version: expectedVersion + 1 };
  const payload = JSON.stringify(next);
  const result = expectedVersion === 0
    ? await db.run('INSERT OR IGNORE INTO axolotl_state(kind,id,version,payload_json) VALUES (?,?,1,?)', kind, id, payload)
    : await db.run('UPDATE axolotl_state SET version = ?, payload_json = ? WHERE kind = ? AND id = ? AND version = ?', next.version, payload, kind, id, expectedVersion);
  if (result.changes !== 1) throw error('AXOLOTL_STATE_CONFLICT');
  return next;
}

async function save(db, entry) {
  await ensure(db);
  return transaction(db, (tx) => write(tx, entry));
}

async function list(db, kind) {
  await ensure(db);
  const rows = await db.all('SELECT payload_json FROM axolotl_state WHERE kind = ? ORDER BY id', kind);
  return rows.map((row) => JSON.parse(row.payload_json));
}

async function putEvidence(db, evidence) {
  const id = `axolotl-proof:${hash(evidence)}`;
  await db.run('INSERT OR IGNORE INTO axolotl_evidence(id,session_id,subject_hash,payload_json,created_at) VALUES (?,?,?,?,?)',
    id, evidence.sessionId, evidence.subjectHash, JSON.stringify(evidence), new Date().toISOString());
  return id;
}

async function evidence(db, id) {
  await ensure(db);
  const row = await db.get('SELECT payload_json FROM axolotl_evidence WHERE id = ?', id);
  if (!row) throw error('AXOLOTL_EVIDENCE_NOT_FOUND');
  const value = JSON.parse(row.payload_json);
  if (id !== `axolotl-proof:${hash(value)}`) throw error('AXOLOTL_EVIDENCE_TAMPERED');
  return value;
}

async function assertOwner(db, owner) {
  if (!owner) throw error('REGENERATION_ORCHESTRATOR_REQUIRED');
  const agent = await db.get("SELECT id, workspace_id FROM agents WHERE id = ? AND execution_mode = 'orchestrator'", owner);
  if (!agent) throw error('REGENERATION_ORCHESTRATOR_NOT_FOUND');
  return agent;
}

module.exports = { ensure, read, write, save, list, transaction, putEvidence, evidence, assertOwner, hash, error, clone };
