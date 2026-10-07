'use strict';

const { seed } = require('./test_bounded_worker_delegation');
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'p1-native-completion-test-only';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { scoped } = require('./helpers/nativeWorkerFixtures');
const { getDatabase, closeDatabase } = require('../src/db');

async function qualify(db) {
  const result = await require('../src/services/agents/subOrchestratorDispatchService').dispatchSubOrchestratorWorker(db,
    'delegation-sub', { mission: 'Compute the scoped subset sum', workerKind: 'bounded_worker', methodContract: scoped, timeoutMs: 60000 });
  const row = await db.get('SELECT * FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', result.childAgentId);
  console.log('Native completion result', JSON.stringify({ success: result.success, status: row?.status, reason: row?.guardrail_reason }));
  assert.ok(['completed', 'awaiting_approval'].includes(row?.status));
  const request = { runId: row.id, agentId: result.childAgentId };
  const authority = await require('../src/services/missionEnvelopeAuthority').read(db, row.id);
  const journal = require('../src/services/epistemic/nativeOracleJournal');
  const attestation = await journal.read(db, { ...request, scope: authority.envelope.scope, kind: 'attestation' });
  const accepted = await journal.read(db, { ...request, scope: authority.envelope.scope, kind: 'acceptance' });
  assert.equal(attestation.value.accepted, true);
  assert.equal(attestation.value.costs.processes, 2);
  assert.equal(attestation.value.costs.modelTokens, 0);
  assert.equal(attestation.value.costs.localComputeUsd, null);
  assert.equal(accepted.value.status, row.status);
  const nonces = await db.all('SELECT nonce FROM verifier_receipt_nonces');
  assert.equal(nonces.length, 2);
  const repeated = await require('../src/services/epistemic/nativeOracleCoordinator').prepare(db, request);
  assert.deepEqual(repeated, { eventId: attestation.eventId, hash: attestation.hash });
  assert.equal((await db.all('SELECT nonce FROM verifier_receipt_nonces')).length, 2);
  const receipt = await require('../src/services/biologicalWorkerStore').receipt(db, row.id);
  assert.equal(receipt.result.verified, true);
  assert.equal(receipt.semanticVerification.budgetAssessment.satisfied, true);
  await require('./helpers/nativeCompletionProbes').qualify(db, { request, authority, attestation });
  await humanApproval(db);
  await require('./helpers/nativeOracleReservationProbes').contention(db,
    () => require('../src/services/agents/subOrchestratorDispatchService').dispatchSubOrchestratorWorker(db,
      'delegation-sub', { mission: 'Compute the scoped subset sum', workerKind: 'bounded_worker', methodContract: scoped, timeoutMs: 60000 }));
  await require('./helpers/nativeOracleBudgetProbes').qualify(db);
  console.log('Native proof budget, sealed reference and nonce ownership verified.');
}

async function humanApproval(db) {
  await require('../src/services/strategyContractService').saveContract(db, { agentId: 'delegation-root',
    workspaceId: 'delegation-ws', problem: 'Compute bounded subset sum with human supervision',
    problemProfile: { reversibility: 'low' } });
  const result = await require('../src/services/agents/subOrchestratorDispatchService').dispatchSubOrchestratorWorker(db,
    'delegation-sub', { mission: 'Compute the scoped subset sum', workerKind: 'bounded_worker', methodContract: scoped, timeoutMs: 60000 });
  const row = await db.get('SELECT * FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', result.childAgentId);
  assert.equal(row.status, 'awaiting_approval', row.guardrail_reason);
  const service = require('../src/services/strategyExecutionService');
  await assert.rejects(service.approveRun(db, row.id, {}), /human approval/);
  const before = (await db.all('SELECT nonce FROM verifier_receipt_nonces')).length;
  const options = { humanApprovalReceipt: { approved: true, approvalId: `native-${row.id}`, approverId: 'test-human',
    approvedAt: new Date().toISOString(), payloadHash: require('../src/services/trinityProvenanceValues').digest({ runId: row.id }) } };
  await require('./helpers/nativeCompletionProbes').promotionRefusals(db, { row, options });
  const approved = await service.approveRun(db, row.id, options);
  assert.equal(approved.status, 'completed');
  assert.equal((await db.all('SELECT nonce FROM verifier_receipt_nonces')).length, before);
  assert.equal((await service.approveRun(db, row.id, options)).status, 'completed');
  await require('./helpers/nativeMemoryProbes').qualify(db, { runId: row.id, agentId: row.agent_id });
  console.log('Real native approval: human proof required, promotion completed and retry did not consume nonces again.');
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-p1-native-completion-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'task.txt'), 'Bounded native task');
  process.env.GENOS_DB_PATH = path.join(root, 'completion.db');
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  process.env.GENOS_CAPSULE_ROOT = path.join(root, 'capsules');
  process.env.GENOS_WORKSPACES_ROOT = root;
  process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  try { await seed(db, workspace); await qualify(db); }
  finally {
    await require('../src/services/garageRuntimeService').stop(db);
    await closeDatabase();
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch(failure => { console.error(failure); process.exitCode = 1; });
