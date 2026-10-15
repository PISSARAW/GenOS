'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { digest } = require('./biologicalIntegrity');

const TABLE_SQL = `CREATE TABLE IF NOT EXISTS causal_learning_outbox (
  run_id TEXT PRIMARY KEY, agent_id TEXT NOT NULL, mission_id TEXT NOT NULL,
  organization_id TEXT, project_id TEXT, event_json TEXT NOT NULL, event_hash TEXT NOT NULL,
  quality_evidence_json TEXT NOT NULL, evidence_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','rejected')),
  attempts INTEGER NOT NULL DEFAULT 0, next_attempt_ms INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT, lease_until_ms INTEGER, loop_receipt_json TEXT, loop_receipt_hash TEXT,
  memory_json TEXT, memory_hash TEXT,
  last_error TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
); CREATE INDEX IF NOT EXISTS idx_causal_learning_pending
  ON causal_learning_outbox(status, next_attempt_ms, lease_until_ms);`;

async function ensure(db) {
  await db.exec(TABLE_SQL);
  const columns = await db.all('PRAGMA table_info(causal_learning_outbox)');
  if (!columns.some((column) => column.name === 'memory_hash')) {
    await db.exec('ALTER TABLE causal_learning_outbox ADD COLUMN memory_hash TEXT');
  }
  if (!columns.some((column) => column.name === 'loop_receipt_hash')) {
    await db.exec('ALTER TABLE causal_learning_outbox ADD COLUMN loop_receipt_hash TEXT');
  }
}

function canonicalPayload(input) {
  return { runId: input.run.id, agentId: input.run.agent_id, missionId: input.biologicalReceipt.missionId,
    organizationId: input.scope.organizationId, projectId: input.scope.projectId,
    event: input.event, qualityEvidence: input.event.payload.qualityEvidence };
}

async function enqueue(db, input) {
  const value = canonicalPayload(input);
  const eventJson = JSON.stringify(value.event);
  const evidenceJson = JSON.stringify(value.qualityEvidence);
  await ensure(db);
  await db.run(`INSERT OR IGNORE INTO causal_learning_outbox
    (run_id, agent_id, mission_id, organization_id, project_id, event_json, event_hash,
     quality_evidence_json, evidence_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  value.runId, value.agentId, value.missionId, value.organizationId, value.projectId,
  eventJson, digest(value.event), evidenceJson, digest(value.qualityEvidence));
  const saved = await db.get('SELECT * FROM causal_learning_outbox WHERE run_id = ?', value.runId);
  const identityMatches = saved?.agent_id === value.agentId && saved.mission_id === value.missionId
    && saved.organization_id === value.organizationId && saved.project_id === value.projectId;
  if (!saved || !identityMatches || saved.evidence_hash !== digest(value.qualityEvidence)
      || saved.event_hash !== digest(value.event)) {
    throw Object.assign(new Error('Causal learning event conflicts with its persisted run.'), { code: 'CAUSAL_LEARNING_EVENT_CONFLICT' });
  }
  return saved;
}

async function claimOne(db) {
  const now = Date.now();
  return withTransaction(db, async () => {
    const row = await db.get(`SELECT * FROM causal_learning_outbox WHERE
      (status='pending' AND next_attempt_ms <= ?) OR (status='processing' AND lease_until_ms <= ?)
      ORDER BY created_at, run_id LIMIT 1`, now, now);
    if (!row) return null;
    const token = crypto.randomUUID();
    const result = await db.run(`UPDATE causal_learning_outbox SET status='processing', attempts=attempts+1,
      lease_token=?, lease_until_ms=? WHERE run_id=? AND ((status='pending' AND next_attempt_ms <= ?)
      OR (status='processing' AND lease_until_ms <= ?))`, token, now + 30000, row.run_id, now, now);
    return result.changes ? { ...row, lease_token: token, attempts: row.attempts + 1 } : null;
  });
}

async function verifyCurrent(db, row) {
  const source = await loadCurrentSource(db, row);
  if (!validCurrentProof(source, row)) {
    throw Object.assign(new Error('Persisted causal learning proof no longer validates.'), { code: 'CAUSAL_LEARNING_PROOF_REJECTED' });
  }
  return source;
}

async function loadCurrentSource(db, row) {
  const event = verified(row.event_json, row.event_hash);
  const qualityEvidence = verified(row.quality_evidence_json, row.evidence_hash);
  const run = await db.get('SELECT id, agent_id, status FROM strategy_execution_runs WHERE id=?', row.run_id);
  const store = require('./biologicalWorkerStore');
  const receipt = await store.receipt(db, row.run_id);
  const binding = await store.binding(db, row.run_id);
  const oracle = await readCurrentOracle(db, row, event);
  return { event, qualityEvidence, run, receipt, binding, oracle };
}

async function readCurrentOracle(db, row, event) {
  try {
    return await require('./epistemic/nativeOracleGate').historical(db, {
      runId: row.run_id, agentId: row.agent_id, event
    });
  } catch (error) {
    if (['SQLITE_BUSY', 'SQLITE_LOCKED'].includes(error.code)) throw error;
    throw Object.assign(new Error('Native oracle proof no longer validates.'), { code: 'CAUSAL_LEARNING_PROOF_REJECTED' });
  }
}

function validCurrentProof(source, row) {
  return validCurrentScope(source.binding, row) && validCurrentReceipt(source, row)
    && validQualityEvidence(source.qualityEvidence, source.event, row);
}

function validCurrentScope(binding, row) {
  return binding?.workerId === row.agent_id && binding.missionId === row.mission_id
    && binding.tenant.organizationId === row.organization_id && binding.tenant.projectId === row.project_id;
}

function validCurrentReceipt(source, row) {
  const receipt = source.receipt;
  const reference = receipt?.semanticVerification;
  return source.run?.status === 'completed' && receipt?.result?.verified === true
    && receipt?.budgetAssessment?.satisfied === true && receipt.runId === row.run_id
    && reference?.schema === 'genos.native-oracle-receipt-reference/v1'
    && source.oracle?.proof?.attestation?.hash === reference.hash
    && source.oracle?.acceptance?.hash === reference.acceptanceHash;
}

function validQualityEvidence(qualityEvidence, event, row) {
  const binding = { actionId: row.run_id, agentId: row.agent_id,
    organizationId: row.organization_id, projectId: row.project_id };
  return require('./morphogenesis/learning/outcomeEvidenceValidation').validate(qualityEvidence, binding)
    && digest(event.payload?.qualityEvidence) === digest(qualityEvidence);
}

function verified(json, hash) {
  const value = JSON.parse(json);
  if (digest(value) !== hash) throw Object.assign(new Error('Causal learning outbox integrity mismatch.'), { code: 'CAUSAL_LEARNING_INTEGRITY_MISMATCH' });
  return value;
}

async function processRow(db, row) {
  try {
    const source = await verifyCurrent(db, row);
    const loopReceipt = require('./morphogenesis/causalLoopService').processActionReceipt({
      agentId: row.agent_id, organizationId: row.organization_id, projectId: row.project_id,
      idempotencyKey: row.run_id,
      actionReceipt: require('./causalLoopExecutionBridge').actionReceipt(source.run, source.event, source.qualityEvidence)
    });
    if (loopReceipt.error) throw Object.assign(new Error('Causal learning idempotency key conflicts with a prior action.'), {
      code: 'CAUSAL_LEARNING_IDEMPOTENCY_CONFLICT'
    });
    const memory = loopReceipt.memoryConsolidated?.entry || null;
    await db.run(`UPDATE causal_learning_outbox SET status='completed', loop_receipt_json=?, loop_receipt_hash=?, memory_json=?, memory_hash=?,
      completed_at=CURRENT_TIMESTAMP, lease_token=NULL, lease_until_ms=NULL, last_error=NULL
      WHERE run_id=? AND status='processing' AND lease_token=?`, JSON.stringify(loopReceipt),
    digest(loopReceipt), memory ? JSON.stringify(memory) : null, memory ? digest(memory) : null,
    row.run_id, row.lease_token);
    return { status: 'observed', receipt: loopReceipt };
  } catch (error) {
    const rejected = ['CAUSAL_LEARNING_PROOF_REJECTED', 'CAUSAL_LEARNING_INTEGRITY_MISMATCH',
      'CAUSAL_LEARNING_IDEMPOTENCY_CONFLICT'].includes(error.code);
    const delay = Math.min(300000, 1000 * (2 ** Math.min(row.attempts, 8)));
    await db.run(`UPDATE causal_learning_outbox SET status=?, next_attempt_ms=?, lease_token=NULL,
      lease_until_ms=NULL, last_error=? WHERE run_id=? AND status='processing' AND lease_token=?`,
    rejected ? 'rejected' : 'pending', Date.now() + delay, String(error.message).slice(0, 500), row.run_id, row.lease_token);
    return { status: rejected ? 'refused' : 'retrying', reason: error.code || 'CAUSAL_LEARNING_PROCESSING_FAILED' };
  }
}

async function drain(db, options = {}) {
  await ensure(db);
  const limit = Math.max(1, Math.min(25, Number(options.limit) || 5));
  const results = [];
  for (let i = 0; i < limit; i += 1) {
    const row = await claimOne(db);
    if (!row) break;
    results.push(await processRow(db, row));
  }
  return results;
}

async function recentMemories(db, input) {
  await ensure(db);
  const rows = await db.all(`SELECT * FROM causal_learning_outbox WHERE agent_id=? AND organization_id IS ?
    AND project_id IS ? AND status='completed' AND memory_json IS NOT NULL
    ORDER BY completed_at DESC LIMIT ?`, input.agentId, input.organizationId || null,
  input.projectId || null, Math.max(1, Math.min(10, Number(input.limit) || 5)));
  const memories = [];
  for (const row of rows) {
    try {
      const proof = await verifyCurrent(db, row);
      const memory = verified(row.memory_json, row.memory_hash);
      memories.push({ ...memory, id: row.run_id, actionType: 'verified_strategy_execution',
        actionInput: `strategy execution ${row.run_id}`, observationOutput: `Verified outcome quality ${proof.qualityEvidence.value}.`,
        rewardScore: Number(proof.qualityEvidence.value), evidenceRefs: [proof.qualityEvidence.receiptId],
        provenance: { runId: row.run_id, receiptId: proof.qualityEvidence.receiptId },
        provenanceIntegrity: row.evidence_hash });
    } catch (_) {}
  }
  return memories;
}

async function completed(db, runId) {
  await ensure(db);
  const row = await db.get("SELECT loop_receipt_json, loop_receipt_hash FROM causal_learning_outbox WHERE run_id=? AND status='completed'", runId);
  return row ? { status: 'observed', receipt: verified(row.loop_receipt_json, row.loop_receipt_hash), replayed: true } : null;
}

module.exports = { ensure, enqueue, drain, recentMemories, completed };
