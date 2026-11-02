'use strict';
const { digest, fail } = require('./qualityContract');
const integrity = require('./qualityReceiptIntegrity');

async function ensure(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS gqel_quality_receipts (
    receipt_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, agent_id TEXT NOT NULL,
    mission_id TEXT NOT NULL, contract_digest TEXT NOT NULL, artifact_digest TEXT NOT NULL,
    receipt_json TEXT NOT NULL, session_json TEXT NOT NULL,
    UNIQUE (run_id, contract_digest));
    CREATE TABLE IF NOT EXISTS gqel_quality_checkpoints (
    run_id TEXT NOT NULL, session_id TEXT NOT NULL, sequence INTEGER NOT NULL,
    checkpoint_json TEXT NOT NULL, PRIMARY KEY (run_id, session_id, sequence));`);
}

async function put(db, input) {
  await ensure(db);
  const { receipt, session } = input;
  await db.run(`INSERT OR IGNORE INTO gqel_quality_receipts
    (receipt_id, run_id, agent_id, mission_id, contract_digest, artifact_digest, receipt_json, session_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, receipt.receiptId, receipt.runId, receipt.agentId,
  receipt.missionId, receipt.contractDigest, receipt.artifactDigest, integrity.encode(receipt), integrity.encode(session));
  const row = await db.get('SELECT * FROM gqel_quality_receipts WHERE run_id = ? AND contract_digest = ?', receipt.runId, receipt.contractDigest);
  if (!row || row.receipt_json !== integrity.encode(receipt) || row.session_json !== integrity.encode(session)) {
    throw fail('GQEL_RECEIPT_CONFLICT', 'Execution already has a different quality receipt or session.');
  }
  return receipt;
}

async function get(db, input) {
  await ensure(db);
  const row = await db.get('SELECT * FROM gqel_quality_receipts WHERE run_id = ? AND contract_digest = ?', input.runId, input.contractDigest);
  if (!row) return null;
  const receipt = JSON.parse(row.receipt_json), session = JSON.parse(row.session_json);
  if (!integrity.authenticated(receipt) || digest(session) !== receipt.sessionDigest) throw fail('GQEL_RECEIPT_INVALID', 'Persisted quality receipt or session was altered.');
  if (receipt.runId !== row.run_id || receipt.agentId !== row.agent_id || receipt.missionId !== row.mission_id) throw fail('GQEL_RECEIPT_SCOPE_MISMATCH', 'Persisted receipt identity differs from its record.');
  if (receipt.contractDigest !== row.contract_digest || receipt.artifactDigest !== row.artifact_digest) throw fail('GQEL_RECEIPT_INVALID', 'Persisted receipt binding differs from its record.');
  return { receipt, session };
}

async function checkpoint(db, body) {
  await ensure(db);
  const record = integrity.sign(body), encoded = integrity.encode(record);
  await db.run(`INSERT OR IGNORE INTO gqel_quality_checkpoints
    (run_id, session_id, sequence, checkpoint_json) VALUES (?, ?, ?, ?)`,
  body.runId, body.session.sessionId, body.sequence, encoded);
  const row = await db.get('SELECT checkpoint_json FROM gqel_quality_checkpoints WHERE run_id = ? AND session_id = ? AND sequence = ?',
    body.runId, body.session.sessionId, body.sequence);
  if (row?.checkpoint_json !== encoded) throw fail('GQEL_CHECKPOINT_CONFLICT', 'Checkpoint sequence already has different content.');
  return record;
}

module.exports = { ensure, put, get, checkpoint };
