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
const native = require('../src/services/agow/nativeMissionOutcomeVerifier');
const contract = require('../src/services/agow/missionObservationContract');
const { digest } = require('../src/services/evidenceProtocol/canonical');

async function qualify(db) {
  const dispatched = await require('../src/services/agents/subOrchestratorDispatchService').dispatchSubOrchestratorWorker(db,
    'delegation-sub', { mission: 'Compute and independently verify the scoped subset sum', workerKind: 'bounded_worker',
      methodContract: scoped, timeoutMs: 60000 });
  assert.equal(dispatched.success, true, JSON.stringify(dispatched));
  const agentId = dispatched.childAgentId;
  const run = await db.get('SELECT * FROM strategy_execution_runs WHERE agent_id=? ORDER BY rowid DESC LIMIT 1', agentId);
  assert.equal(run.status, 'completed', run.guardrail_reason);
  const journal = await workspace.listMissionObservations({ db, agentId });
  assert.equal(journal.length, 1);
  const record = journal[0];
  assert.equal(record.status, 'verified', JSON.stringify(record));
  assert.equal(record.binding.runId, run.id);
  assert.equal(record.binding.measurementContract, native.MEASUREMENT_CONTRACT);
  assert.equal(record.observation.metrics.realizedLoss, 0);
  assert.equal(record.observation.metrics.goalProgress, 1);
  assert.equal(record.policyUpdated, false);
  assert.equal(record.promotionAllowed, false);
  const events = await store.observations(db, run.id);
  const terminal = events.find((item) => item.event.eventType === 'AGENT_COMPLETED').event;
  const input = { db, binding: record.binding, eventIdentity: contract.eventIdentity(terminal, record.binding),
    event: { eventId: terminal.id, ...contract.eventContent(terminal) } };
  const rechecked = await native.verify(input);
  assert.equal(rechecked.metrics.realizedLoss, 0);
  await refusals(db, { input, terminal, run });
  await require('./helpers/agowNativeReceiptProbes').qualify(db, input);
  const receipt = await store.receipt(db, run.id);
  const proof = await require('../src/services/epistemic/nativeOracleGate').historical(db, { runId: run.id, agentId, event: terminal });
  const verifications = proof.proof.saved.evaluation.assembly.verifications;
  assert.equal(new Set(verifications.map((item) => item.executionEvidence[0].processId)).size, 2);
  assert.ok(verifications.every((item) => item.executionEvidence[0].processId !== process.pid));
  assert.deepEqual(await workspace.observeMissionOutcome({ db, agentId, runId: run.id, event: terminal }), record);
  return { runId: run.id, agentId, record, receipt, terminal,
    verifierStrategies: verifications.map((item) => item.executionEvidence[0].postconditions.strategy),
    verifierProcessIds: verifications.map((item) => item.executionEvidence[0].processId),
    oracleCosts: proof.proof.attestation.value.costs,
    qualification: 'real_authorized_native_runtime_with_two_independent_oracle_processes', promotionAllowed: false };
}

async function refusals(db, context) {
  const { input, terminal, run } = context;
  await assert.rejects(native.verify({ ...input, binding: { ...input.binding, missionId: 'foreign-mission' } }), /owner-mismatch/);
  await assert.rejects(native.verify({ ...input, binding: { ...input.binding, measurementContract: 'untrusted-metric' } }), /metric-contract-required/);
  const substituted = { ...terminal, payload: { ...terminal.payload, evidenceReport: { outcome: 'success' } } };
  await assert.rejects(native.verify({ ...input, eventIdentity: contract.eventIdentity(substituted, input.binding) }), /terminal-mismatch/);
  await db.run('UPDATE strategy_execution_runs SET guardrail_reason=? WHERE id=?', 'qualification-refusal', run.id);
  try { await assert.rejects(native.verify(input), /completed-run-required/); }
  finally { await db.run('UPDATE strategy_execution_runs SET guardrail_reason=? WHERE id=?', run.guardrail_reason, run.id); }
  assert.equal(native.supports({ workerKind: 'bounded_worker', methodContract: { methodId: 'unknown' } }), false);
}

async function main() {
  const outputRoot = process.env.GENOS_AGOW_QUALIFICATION_ROOT
    || path.resolve(__dirname, '../../.genos-agent-worlds/agow-native-mission');
  const directory = path.join(outputRoot, randomUUID());
  const root = path.join(directory, 'workspace');
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, 'task.txt'), 'Compute subset sum with bounded independent semantic verification.');
  process.env.GENOS_DB_PATH = path.join(directory, 'mission.sqlite');
  process.env.GENOS_STUDIO_ROOT = path.join(directory, 'studio');
  process.env.GENOS_CAPSULE_ROOT = path.join(directory, 'capsules');
  process.env.GENOS_WORKSPACES_ROOT = directory;
  process.env.GENOS_DISABLE_WORKSPACE_GC = '1';
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'agow-native-qualification-only';
  process.env.GENOS_AGOW_MODE = 'bounded';
  const files = ['backend/src/services/agow/nativeMissionOutcomeVerifier.js',
    'backend/src/services/agow/missionObservationService.js', 'backend/src/services/agow/missionObservationRuntimeBridge.js',
    'backend/src/services/agents/deterministicWorkerRuntime.js', 'backend/tests/test_agow_native_mission.js',
    'backend/tests/helpers/agowNativeReceiptProbes.js'];
  const sources = {};
  for (const file of files) sources[file] = digest(await fs.readFile(path.resolve(__dirname, '../..', file), 'utf8'));
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ metric: native.MEASUREMENT_CONTRACT,
    method: scoped, sources, qualification: 'local_engineering_qualification', promotionAllowed: false }, null, 2));
  const db = await getDatabase(process.env.GENOS_DB_PATH);
  try {
    await seed(db, root);
    const result = await qualify(db);
    await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ directory, runId: result.runId, status: result.record.status,
      metrics: result.record.observation.metrics, verifierStrategies: result.verifierStrategies,
      oracleCosts: result.oracleCosts, promotionAllowed: false }));
  } finally {
    await require('../src/services/garageRuntimeService').stop(db);
    await require('./helpers/flushTelemetrySideEffects').flushTelemetrySideEffects();
    await closeDatabase();
  }
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
