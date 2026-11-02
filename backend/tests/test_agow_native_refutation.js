'use strict';

const { seed } = require('./test_bounded_worker_delegation');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { scoped } = require('./helpers/nativeWorkerFixtures');
const { getDatabase, closeDatabase } = require('../src/db');
const workspace = require('../src/services/globalWorkspaceService');
const store = require('../src/services/biologicalWorkerStore');
const journal = require('../src/services/epistemic/nativeOracleJournal');
const native = require('../src/services/agow/nativeMissionOutcomeVerifier');
const { digest } = require('../src/services/evidenceProtocol/canonical');

function methodFor(condition) {
  if (condition !== 'inconclusive_oracle') return scoped;
  return { version: 1, methodId: 'scoped_procedure', parameters: {
    procedure: { version: 1, methodId: 'subset_sum', parameters: { values: Array(21).fill(1), target: 10 } } } };
}

async function dispatch(db, condition) {
  const scopedWorker = require('../src/services/agents/workerScopedProcedures');
  const original = scopedWorker.runScoped;
  scopedWorker.runScoped = (method, context) => {
    if (condition === 'technical_failure') throw new Error('Controlled worker failure before evidence.');
    const result = structuredClone(original(method, context));
    if (condition === 'refuted_result') {
      const content = result.evidenceReport.workerArtifact.content;
      content.result.sum += 1;
      content.procedureReceipt.result = structuredClone(content.result);
    }
    return result;
  };
  try {
    return await require('../src/services/agents/subOrchestratorDispatchService').dispatchSubOrchestratorWorker(db,
      'delegation-sub', { mission: 'Compute the scoped subset sum under matched verification limits',
        workerKind: 'bounded_worker', methodContract: methodFor(condition), timeoutMs: 60000 });
  } finally { scopedWorker.runScoped = original; }
}

async function arm(db, condition) {
  const result = await dispatch(db, condition);
  const run = await db.get('SELECT * FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', result.childAgentId);
  const record = (await workspace.listMissionObservations({ db, agentId: run.agent_id }))[0];
  const authority = await require('../src/services/missionEnvelopeAuthority').read(db, run.id);
  const request = { runId: run.id, agentId: run.agent_id, scope: authority.envelope.scope };
  const attestation = await journal.read(db, { ...request, kind: 'attestation' });
  const allocation = await journal.read(db, { ...request, kind: 'reservation' });
  const events = await store.observations(db, run.id);
  const terminal = events.find((item) => item.event.eventType === 'AGENT_COMPLETED')?.event;
  return { condition, result, run, record, request, attestation, allocation,
    terminal, limits: authority.envelope.limits, receipt: await store.receipt(db, run.id) };
}

async function verifyRefutation(db, checked) {
  const saved = await require('../src/services/aeisAssemblyStore').readAssembly(db, checked.attestation.value.assemblyId);
  const proof = { attestation: checked.attestation, allocation: checked.allocation, saved, request: checked.request };
  const subject = await require('../src/services/epistemic/nativeOracleDomains').load(db, checked.request);
  const contract = require('../src/services/agow/missionObservationContract');
  const context = { db, binding: checked.record.binding,
    eventIdentity: contract.eventIdentity(checked.terminal, checked.record.binding), event: checked.terminal };
  await require('./helpers/agowRefutationProbes').qualify(db, { context, proof, subject });
  assert.equal(await journal.read(db, { ...checked.request, kind: 'acceptance' }), null);
  assert.equal(checked.receipt.result.verified, false);
  assert.equal(checked.run.status, 'blocked');
}

async function qualify(db) {
  const correct = await arm(db, 'correct_result');
  assert.equal(correct.record?.status, 'verified', JSON.stringify(correct.record));
  assert.equal(correct.record.observation.metrics.realizedLoss, 0);
  const refuted = await arm(db, 'refuted_result');
  assert.equal(refuted.record?.status, 'verified', JSON.stringify(refuted));
  assert.equal(refuted.record.observation.metrics.realizedLoss, 1);
  assert.deepEqual(correct.limits, refuted.limits, 'Compared arms have exactly matched declared resource limits.');
  assert.equal(correct.attestation.value.costs.processes, 2);
  assert.equal(refuted.attestation.value.costs.processes, 2);
  await verifyRefutation(db, refuted);
  const unknown = await arm(db, 'technical_failure');
  assert.equal(unknown.record?.status, 'verification_pending', JSON.stringify(unknown.record));
  assert.equal(unknown.record.observation.metrics, undefined);
  assert.equal(unknown.attestation, null);
  const inconclusive = await arm(db, 'inconclusive_oracle');
  assert.equal(inconclusive.run.status, 'blocked');
  assert.equal(inconclusive.attestation.value.costs.processes, 2);
  assert.equal(inconclusive.record.status, 'verification_pending');
  assert.equal(inconclusive.record.observation.metrics, undefined);
  return [correct, refuted, unknown, inconclusive];
}

function summarize(results) {
  const known = results.filter((item) => item.record.status === 'verified');
  const losses = known.map((item) => item.record.observation.metrics.realizedLoss);
  const lossSum = losses.reduce((sum, value) => sum + value, 0);
  const unknown = results.length - known.length;
  return { tasks: results.length, measured: known.length, unknown, coverage: known.length / results.length,
    meanKnownLoss: lossSum / known.length, allTaskLossBounds: [lossSum / results.length, (lossSum + unknown) / results.length],
    interpretation: 'engineering_fault_control_not_policy_uplift', promotionAllowed: false };
}

async function main() {
  const outputRoot = process.env.GENOS_AGOW_QUALIFICATION_ROOT
    || path.resolve(__dirname, '../../.genos-agent-worlds/agow-native-refutation');
  const directory = path.join(outputRoot, randomUUID());
  const root = path.join(directory, 'workspace');
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, 'task.txt'), 'Matched native outcomes with independent refutations.');
  process.env.GENOS_DB_PATH = path.join(directory, 'mission.sqlite');
  process.env.GENOS_STUDIO_ROOT = path.join(directory, 'studio');
  process.env.GENOS_CAPSULE_ROOT = path.join(directory, 'capsules');
  process.env.GENOS_WORKSPACES_ROOT = directory;
  process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'agow-refutation-qualification-only';
  process.env.GENOS_AGOW_MODE = 'bounded';
  const files = ['backend/src/services/agow/nativeMissionOutcomeVerifier.js',
    'backend/src/services/agow/nativeRefutedOutcomeVerifier.js', 'backend/src/services/agow/nativeRefutationReceipts.js',
    'backend/src/services/agents/deterministicWorkerRuntime.js', 'backend/tests/test_agow_native_refutation.js',
    'backend/tests/helpers/agowRefutationProbes.js', 'backend/src/services/epistemic/nativeOracleProof.js',
    'backend/src/services/epistemic/nativeOracleCoordinator.js', 'backend/src/services/epistemic/oracleProcedureAdapter.js',
    'backend/src/services/epistemic/oracleSubsetChecks.js', 'backend/src/services/epistemic/oracleNativeProcess.js',
    'backend/src/services/epistemic/verifierRuntimeBridge.js', 'backend/src/services/epistemicVerifierReceiptService.js',
    'backend/src/services/aeisAssemblyStore.js', 'backend/src/services/epistemic/nativeOracleExecutionJournal.js',
    'backend/src/services/epistemic/nativeOracleJournal.js', 'backend/src/services/missionEnvelopeAuthority.js',
    'backend/src/services/biologicalWorkerReceiptService.js', 'backend/src/services/biologicalWorkerStore.js'];
  const sources = {};
  for (const file of files) sources[file] = digest(await fs.readFile(path.resolve(__dirname, '../..', file), 'utf8'));
  const conditions = ['correct_result', 'refuted_result', 'technical_failure', 'inconclusive_oracle'];
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ metric: native.MEASUREMENT_CONTRACT,
    methods: Object.fromEntries(conditions.map((condition) => [condition, methodFor(condition)])), conditions, sources,
    primaryMetric: 'binary_subset_postcondition_loss', promotionAllowed: false }, null, 2));
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  try {
    await seed(db, root);
    const results = await qualify(db);
    const summary = summarize(results);
    assert.equal(summary.measured, 2);
    assert.equal(summary.unknown, 2);
    for (const file of files) {
      assert.equal(digest(await fs.readFile(path.resolve(__dirname, '../..', file), 'utf8')), sources[file], `Source drift: ${file}`);
    }
    await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify({ results, summary, promotionAllowed: false }, null, 2));
    console.log(JSON.stringify({ directory, results: results.map((item) => ({ condition: item.condition,
      runStatus: item.run.status, measurementStatus: item.record.status,
      loss: item.record.observation.metrics?.realizedLoss ?? null,
      oracleProcesses: item.attestation?.value.costs.processes ?? null })), summary, promotionAllowed: false }));
  } finally {
    await require('../src/services/garageRuntimeService').stop(db);
    await require('./helpers/flushTelemetrySideEffects').flushTelemetrySideEffects();
    await closeDatabase();
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
