'use strict';

const { seed } = require('./test_bounded_worker_delegation');
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'p1-memory-budget-test-only';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const subjects = require('../src/services/epistemic/oracleMemorySubject');
const journal = require('../src/services/epistemic/nativeOracleJournal');
const execution = require('../src/services/strategyExecutionService');
const values = require('../src/services/trinityProvenanceValues');
const { getDatabase, closeDatabase } = require('../src/db');

async function dispatch(db, method) {
  const result = await require('../src/services/agents/subOrchestratorDispatchService').dispatchSubOrchestratorWorker(db,
    'delegation-sub', { mission: 'Verify memory fidelity under its own budget', workerKind: 'verifier_worker', methodContract: method, timeoutMs: 60000 });
  const row = await db.get('SELECT * FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', result.childAgentId);
  const authority = await require('../src/services/missionEnvelopeAuthority').read(db, row.id);
  return { result, row, request: { runId: row.id, agentId: row.agent_id, scope: authority.envelope.scope }, authority };
}

async function approve(db, row) {
  const options = { humanApprovalReceipt: { approved: true, approvalId: `memory-${row.id}`, approverId: 'independent-test-human',
    approvedAt: new Date().toISOString(), payloadHash: values.digest({ runId: row.id }) } };
  assert.equal((await execution.approveRun(db, row.id, options)).status, 'completed');
  assert.equal((await execution.approveRun(db, row.id, options)).status, 'completed');
}

async function source(db) {
  const result = await require('../src/services/agents/subOrchestratorDispatchService').dispatchSubOrchestratorWorker(db,
    'delegation-sub', { mission: 'Compute source for memory verification', workerKind: 'bounded_worker',
      methodContract: require('./helpers/nativeWorkerFixtures').scoped, timeoutMs: 60000 });
  const run = await db.get('SELECT * FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', result.childAgentId);
  assert.equal(run.status, 'awaiting_approval', run.guardrail_reason);
  await approve(db, run);
  const memory = await db.get("SELECT * FROM genome_decisions WHERE created_by=? AND evidence_status='linked'", run.agent_id);
  const subject = await subjects.load(db, { memoryId: memory.id,
    scope: { organizationId: memory.organization_id, projectId: memory.project_id } });
  return { run, memory, subject, method: { version: 1, methodId: 'verify_memory_fidelity',
    parameters: { memoryId: memory.id, expectedBindingHash: values.digest(subject.binding) } } };
}

async function qualify(db) {
  const input = await source(db);
  let checked;
  await require('./helpers/nativeOracleReservationProbes').contention(db, async () => { checked = await dispatch(db, input.method); });
  assert.equal(checked.row.status, 'awaiting_approval', JSON.stringify(checked));
  const attested = await journal.read(db, { ...checked.request, kind: 'attestation' });
  assert.equal(attested.value.domain, 'memory_fidelity');
  assert.equal(attested.value.accepted, true);
  assert.equal(attested.value.costs.processes, 2);
  assert.equal(attested.value.costs.modelTokens, 0);
  assert.equal((await db.all('SELECT nonce FROM verifier_receipt_nonces')).length, 4, 'source and memory verification each spend two nonces');
  const assembly = await require('../src/services/aeisAssemblyStore').readAssembly(db, attested.value.assemblyId);
  for (const receipt of assembly.evaluation.assembly.verifications) {
    assert.equal(receipt.executionEvidence[0].subject.runId, checked.row.id);
    assert.equal(receipt.executionEvidence[0].subject.sourceRunId, input.run.id);
    assert.equal(receipt.executionEvidence[0].subject.allocationHash,
      (await journal.read(db, { ...checked.request, kind: 'reservation' })).hash);
  }
  await approve(db, checked.row);
  assert.equal((await db.all('SELECT nonce FROM verifier_receipt_nonces')).length, 4);
  const view = await require('../src/services/consumerInspectionService').inspect(db,
    { runId: checked.row.id, scope: input.subject.binding.scope });
  assert.equal(view.nativeVerification.current.satisfied, true);
  assert.deepEqual(view.nativeVerification.domain, subjects.DOMAIN);
  await require('./helpers/nativeMemoryBudgetNegatives').qualify(db, { input, checked, dispatch });
  console.log('Native memory verification: sealed authority, distinct source/run budgets, two nonces, concurrent reservation, fresh replay and real approval passed.');
}

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-p1-memory-budget-'));
  const workspace = path.join(root, 'workspace');
  await fs.mkdir(workspace);
  await fs.writeFile(path.join(workspace, 'task.txt'), 'Memory fidelity task');
  process.env.GENOS_DB_PATH = path.join(root, 'memory.db');
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  process.env.GENOS_CAPSULE_ROOT = path.join(root, 'capsules');
  process.env.GENOS_WORKSPACES_ROOT = root;
  process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  try { await seed(db, workspace, { problemProfile: { reversibility: 'low' } }); await qualify(db); }
  finally {
    await require('../src/services/garageRuntimeService').stop(db);
    await closeDatabase();
    await fs.rm(root, { recursive: true, force: true });
  }
}

if (require.main === module) main().catch(failure => { console.error(failure); process.exitCode = 1; });
module.exports = { dispatch, approve, source };
