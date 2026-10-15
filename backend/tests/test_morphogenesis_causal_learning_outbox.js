'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const outbox = require('../src/services/causalLearningOutbox');
const workerStore = require('../src/services/biologicalWorkerStore');
const oracleGate = require('../src/services/epistemic/nativeOracleGate');
const validation = require('../src/services/morphogenesis/learning/outcomeEvidenceValidation');

const run = { id: 'causal-outbox-run', agent_id: 'causal-outbox-agent', status: 'completed' };
const event = { eventType: 'AGENT_COMPLETED', payload: { qualityEvidence: {
  status: 'VERIFIED', actionId: run.id, agentId: run.agent_id,
  organizationId: 'outbox-org', projectId: 'outbox-project', success: true, value: 0.95,
  receiptId: 'outbox-quality-receipt'
} } };
const receipt = { runId: run.id, missionId: 'outbox-mission', result: { verified: true },
  budgetAssessment: { satisfied: true }, semanticVerification: {
    schema: 'genos.native-oracle-receipt-reference/v1', hash: 'oracle-hash', acceptanceHash: 'acceptance-hash'
  } };
const binding = { workerId: run.agent_id, missionId: receipt.missionId,
  tenant: { organizationId: 'outbox-org', projectId: 'outbox-project' } };

async function main() {
  const db = openDatabase();
  await db.exec("CREATE TABLE strategy_execution_runs (id TEXT PRIMARY KEY, agent_id TEXT, status TEXT);");
  await db.run('INSERT INTO strategy_execution_runs VALUES (?, ?, ?)', run.id, run.agent_id, run.status);
  workerStore.receipt = async () => receipt;
  workerStore.binding = async () => binding;
  oracleGate.historical = async () => ({ proof: { attestation: { hash: 'oracle-hash' } }, acceptance: { hash: 'acceptance-hash' } });
  validation.validate = (candidate, expected) => Boolean(candidate && expected)
    && candidate.actionId === expected.actionId && candidate.agentId === expected.agentId
    && candidate.organizationId === expected.organizationId && candidate.projectId === expected.projectId;

  await outbox.enqueue(db, { run, biologicalReceipt: receipt, event,
    scope: { organizationId: 'outbox-org', projectId: 'outbox-project' } });
  await db.run("UPDATE causal_learning_outbox SET status='processing', lease_until_ms=0 WHERE run_id=?", run.id);
  const originalRun = db.run.bind(db);
  let failCompletionOnce = true;
  db.run = (sql, ...params) => {
    if (failCompletionOnce && sql.includes("SET status='completed'")) {
      failCompletionOnce = false;
      return Promise.reject(new Error('simulated completion write interruption'));
    }
    return originalRun(sql, ...params);
  };
  assert.equal((await outbox.drain(db, { limit: 1 }))[0].status, 'retrying');
  db.run = originalRun;
  await db.run('UPDATE causal_learning_outbox SET next_attempt_ms=0 WHERE run_id=?', run.id);
  const recovered = await outbox.drain(db, { limit: 1 });
  assert.equal(recovered[0].status, 'observed');
  assert.equal((await outbox.completed(db, run.id)).replayed, true);
  assert.equal((await outbox.drain(db, { limit: 1 })).length, 0);
  const causalLoop = require('../src/services/morphogenesis/causalLoopService');
  const actionReceipt = require('../src/services/causalLoopExecutionBridge').actionReceipt(run, event,
    event.payload.qualityEvidence);
  const replay = causalLoop.processActionReceipt({ agentId: run.agent_id, organizationId: 'outbox-org',
    projectId: 'outbox-project', idempotencyKey: run.id, actionReceipt });
  assert.deepEqual(replay, recovered[0].receipt);
  assert.equal(causalLoop.getLoopHistory(run.agent_id).length, 1);
  const conflict = causalLoop.processActionReceipt({ agentId: run.agent_id, organizationId: 'outbox-org',
    projectId: 'outbox-project', idempotencyKey: run.id,
    actionReceipt: { ...actionReceipt, observationOutput: 'changed outcome' } });
  assert.equal(conflict.error, 'idempotency_conflict');

  const memories = await outbox.recentMemories(db, { agentId: run.agent_id,
    organizationId: 'outbox-org', projectId: 'outbox-project' });
  assert.equal(memories.length, 1);
  assert.deepEqual(memories[0].evidenceRefs, ['outbox-quality-receipt']);
  assert.equal((await outbox.recentMemories(db, { agentId: run.agent_id,
    organizationId: 'other-org', projectId: 'other-project' })).length, 0);
  const entry = await db.get('SELECT status, attempts, memory_hash FROM causal_learning_outbox WHERE run_id=?', run.id);
  assert.equal(entry.status, 'completed');
  assert.equal(entry.attempts, 2);
  assert.ok(entry.memory_hash);
  await db.run("UPDATE causal_learning_outbox SET loop_receipt_json='{}' WHERE run_id=?", run.id);
  await assert.rejects(outbox.completed(db, run.id), error => error.code === 'CAUSAL_LEARNING_INTEGRITY_MISMATCH');
  await db.close();
  console.log('Causal learning retries an interrupted commit idempotently and recalls tenant-bound evidence-backed memory.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
