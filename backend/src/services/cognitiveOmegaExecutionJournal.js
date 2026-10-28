'use strict';

const { createHash } = require('node:crypto');

async function ensureSchema(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS cognitive_omega_runs (
    run_id TEXT PRIMARY KEY, request_hash TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  ); CREATE TABLE IF NOT EXISTS cognitive_omega_operations (
    run_id TEXT NOT NULL, operation_id TEXT NOT NULL, operation_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('running', 'completed')),
    result_json TEXT, result_hash TEXT, updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (run_id, operation_id),
    FOREIGN KEY (run_id) REFERENCES cognitive_omega_runs(run_id)
  );`);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function hash(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

async function beginRun(db, runId, request) {
  await ensureSchema(db);
  const requestHash = hash(request);
  const existing = await db.get('SELECT request_hash FROM cognitive_omega_runs WHERE run_id = ?', runId);
  if (existing && existing.request_hash !== requestHash) throw new Error('omega_journal_run_conflict');
  if (!existing) await db.run('INSERT INTO cognitive_omega_runs (run_id, request_hash) VALUES (?, ?)',
    runId, requestHash);
}

async function findOperation(db, runId, operationId, operation) {
  const row = await db.get(`SELECT operation_hash, status, result_json, result_hash FROM cognitive_omega_operations
    WHERE run_id = ? AND operation_id = ?`, runId, operationId);
  if (!row) return null;
  if (row.operation_hash !== hash(operation)) throw new Error('omega_journal_operation_conflict');
  const result = row.result_json ? JSON.parse(row.result_json) : null;
  if (result && row.result_hash !== hash(result)) throw new Error('omega_journal_result_corrupt');
  return { status: row.status, result };
}

async function beginOperation(db, input) {
  await db.run(`INSERT INTO cognitive_omega_operations
    (run_id, operation_id, operation_hash, status) VALUES (?, ?, ?, 'running')`,
  input.runId, input.operationId, hash(input.operation));
}

async function completeOperation(db, input) {
  const result = JSON.stringify(input.result);
  await db.run(`UPDATE cognitive_omega_operations SET status = 'completed', result_json = ?,
    result_hash = ?, updated_at = CURRENT_TIMESTAMP
    WHERE run_id = ? AND operation_id = ? AND status = 'running'`,
  result, hash(input.result), input.runId, input.operationId);
}

module.exports = { ensureSchema, beginRun, findOperation, beginOperation, completeOperation, hash };
