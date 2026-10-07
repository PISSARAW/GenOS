'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { currentKeyId, keyFor } = require('./epistemicReceiptKeyring');

async function ensure(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS promotion_execution_journal (
    run_id TEXT PRIMARY KEY REFERENCES strategy_execution_runs(id),
    phase TEXT NOT NULL, payload_json TEXT NOT NULL, result_json TEXT NOT NULL DEFAULT '{}',
    key_id TEXT NOT NULL, signature TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
  await db.exec(`CREATE TABLE IF NOT EXISTS promotion_workspace_claims (
    target_path TEXT PRIMARY KEY, run_id TEXT NOT NULL UNIQUE REFERENCES strategy_execution_runs(id))`);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

function fingerprint(options) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(options))).digest('hex');
}

function signature(row) {
  return crypto.createHmac('sha256', keyFor(row.key_id))
    .update(['promotion-v1', row.run_id, row.phase, row.payload_json, row.result_json].join('\0')).digest('hex');
}

async function read(db, id) {
  await ensure(db);
  const row = await db.get('SELECT * FROM promotion_execution_journal WHERE run_id = ?', id);
  if (!row) return null;
  if (row.signature !== signature(row)) throw new Error('PROMOTION_JOURNAL_INTEGRITY');
  return { ...row, payload: JSON.parse(row.payload_json), result: JSON.parse(row.result_json) };
}

async function reserve(db, request) {
  await ensure(db);
  return withTransaction(db, async () => {
    if (await read(db, request.promotion.runId)) throw new Error('PROMOTION_ALREADY_RESERVED');
    await require('./promotionVerifierNonceService').consume(db, request);
    const binding = await runBinding(db, request.promotion.runId);
    const row = { run_id: request.promotion.runId, phase: 'reserved', key_id: currentKeyId(), result_json: '{}',
      payload_json: JSON.stringify({ promotion: request.promotion, evaluation: request.gateContext.aeisEvaluation,
        binding, options: request.options, optionsHash: fingerprint(request.options), primitives: request.primitives }) };
    await db.run(`INSERT INTO promotion_execution_journal
      (run_id, phase, payload_json, result_json, key_id, signature) VALUES (?, ?, ?, ?, ?, ?)`,
    row.run_id, row.phase, row.payload_json, row.result_json, row.key_id, signature(row));
    return read(db, row.run_id);
  });
}

async function runBinding(db, id) {
  return db.get(`SELECT r.agent_id, r.contract_id, r.contract_version, c.contract_hash,
    w.id AS workspace_id, w.path, w.organization_id, w.project_id FROM strategy_execution_runs r
    JOIN strategy_contracts c ON c.id = r.contract_id JOIN agents a ON a.id = r.agent_id
    JOIN workspaces w ON w.id = a.workspace_id WHERE r.id = ?`, id);
}

async function advance(db, row, next) {
  const updated = { ...row, phase: next.phase, result_json: JSON.stringify(next.result || row.result) };
  const saved = await db.run(`UPDATE promotion_execution_journal SET phase = ?, result_json = ?,
    signature = ?, updated_at = CURRENT_TIMESTAMP WHERE run_id = ? AND phase = ? AND signature = ?`,
  updated.phase, updated.result_json, signature(updated), row.run_id, row.phase, row.signature);
  if (saved.changes !== 1) throw new Error('PROMOTION_JOURNAL_CONFLICT');
  return read(db, row.run_id);
}

module.exports = { read, reserve, advance, fingerprint, runBinding };
