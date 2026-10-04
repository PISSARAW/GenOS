'use strict';

const { randomUUID, createHash } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const { pack, unpack } = require('msgpackr');

async function ensureTable(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS cognitive_inference_receipts (
    invocation_id TEXT PRIMARY KEY,
    signal_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    contract_version INTEGER NOT NULL,
    prompt_digest TEXT NOT NULL,
    prompt_bytes BLOB NOT NULL,
    audit_blob BLOB NOT NULL,
    result_blob BLOB,
    status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    UNIQUE (signal_id, agent_id, contract_version, prompt_digest)
  );`);
}

function keyOf(compiled) {
  return [compiled.contract.source, compiled.contract.recipient,
    compiled.contract.version, compiled.visibility.promptDigest];
}

function auditOf(compiled) {
  return { contract: compiled.contract, admission: compiled.admission,
    visibility: compiled.visibility, omissions: compiled.omissions,
    obligations: compiled.obligations };
}

async function reserve(db, compiled) {
  await ensureTable(db);
  const invocationId = randomUUID();
  const audit = auditOf(compiled);
  await db.run(`INSERT OR IGNORE INTO cognitive_inference_receipts
    (invocation_id, signal_id, agent_id, contract_version, prompt_digest,
     prompt_bytes, audit_blob, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
  [invocationId, ...keyOf(compiled), Buffer.from(compiled.prompt, 'utf8'), pack(audit)]);
  const row = await db.get(`SELECT invocation_id, status, prompt_bytes, audit_blob, result_blob
    FROM cognitive_inference_receipts WHERE signal_id = ? AND agent_id = ?
    AND contract_version = ? AND prompt_digest = ?`, keyOf(compiled));
  const digest = `sha256:${createHash('sha256').update(row.prompt_bytes).digest('hex')}`;
  if (digest !== compiled.visibility.promptDigest) throw new Error('Cognitive receipt prompt digest mismatch.');
  if (!isDeepStrictEqual(unpack(row.audit_blob), audit)) {
    throw new Error('Cognitive receipt obligation audit mismatch.');
  }
  if (row.status === 'completed' && !row.result_blob) throw new Error('Cognitive receipt result is missing.');
  return { invocationId: row.invocation_id, owned: row.invocation_id === invocationId,
    status: row.status, result: row.result_blob ? unpack(row.result_blob) : null };
}

async function complete(db, invocationId, result) {
  const change = await db.run(`UPDATE cognitive_inference_receipts
    SET status = 'completed', result_blob = ?, completed_at = CURRENT_TIMESTAMP
    WHERE invocation_id = ? AND status = 'pending'`, [pack(result), invocationId]);
  if (change.changes !== 1) throw new Error('Cognitive receipt completion was not recorded.');
}

async function fail(db, invocationId) {
  await db.run(`UPDATE cognitive_inference_receipts
    SET status = 'failed', completed_at = CURRENT_TIMESTAMP
    WHERE invocation_id = ? AND status = 'pending'`, invocationId);
}

module.exports = { reserve, complete, fail };
