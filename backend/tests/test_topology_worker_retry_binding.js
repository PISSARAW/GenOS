'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const childProcess = require('node:child_process');
const detachedSpawn = require('../bin/detachedSpawn.cjs');
const testDbPath = path.join(os.tmpdir(), `genos-topology-retry-binding-${Date.now()}.db`);
process.env.GENOS_DB_PATH = testDbPath;
process.env.GENOS_ADMIN_PASSWORD = 'topology-retry-binding-suite-only';
process.env.GENOS_ADMIN_TOKEN = 'topology-retry-binding-suite-token';

const database = require('../src/db');
const biologicalStore = require('../src/services/biologicalWorkerStore');
const integrity = require('../src/services/biologicalIntegrity');
const reader = require('../src/services/topology/workerResultReader.cjs');
const topologyEvidence = require('../src/services/topology/topologyWorkerEvidence.cjs');

async function insertAttempt(db, input) {
  const binding = { runId: input.runId, missionId: input.missionId, workerId: input.workerId };
  await db.run(`INSERT INTO biological_worker_bindings
    (run_id, mission_id, agent_id, binding_hash, binding_json) VALUES (?, ?, ?, ?, ?)`,
  input.runId, input.missionId, input.workerId, integrity.digest(binding), integrity.encode(binding));
  if (!input.outcome) return;
  await insertReceipt(db, { ...input, binding });
}

async function insertReceipt(db, input) {
  const successful = input.outcome === 'success';
  const report = { outcome: successful ? 'success' : 'unresolved',
    claims: successful ? [{ statement: `answer ${input.runId}` }] : [] };
  const event = { id: `event-${input.runId}`, eventType: successful ? 'AGENT_COMPLETED' : 'AGENT_FAILED',
    payload: { executionRunId: input.runId, evidenceReport: report } };
  const eventHash = integrity.digest(event);
  const proof = null;
  const evidence = { report, noAnswerProof: proof, observations: [eventHash],
    hash: integrity.digest({ report, proof }) };
  const receipt = {
    runId: input.runId, missionId: input.missionId, workerId: input.workerId,
    receiptId: `receipt-${input.runId}`, bindingHash: integrity.digest(input.binding),
    result: { status: successful ? 'completed' : 'failed', verified: successful }, evidence
  };
  await db.run(`INSERT INTO biological_worker_observations
    (run_id, event_key, event_hash, event_json, applied) VALUES (?, ?, ?, ?, 1)`,
  input.runId, event.id, eventHash, integrity.encode(event));
  await db.run(`INSERT INTO biological_worker_receipts
    (receipt_id, run_id, mission_id, payload_hash, receipt_json) VALUES (?, ?, ?, ?, ?)`,
  receipt.receiptId, input.runId, input.missionId, integrity.digest(receipt), integrity.encode(receipt));
}

async function verifyRetrySelection(db) {
  const scope = { missionId: 'mission-retry-success', workerId: 'worker-retry-success' };
  await insertAttempt(db, { ...scope, runId: 'run-old', outcome: 'success' });
  await insertAttempt(db, { ...scope, runId: 'run-new', outcome: 'success' });
  const evidence = await reader.readEvidence(db, { member: { workerId: scope.workerId,
    executionRunId: 'run-new' }, missionId: scope.missionId });
  assert.equal(evidence.valid, true);
  assert.equal(evidence.receipt.runId, 'run-new', 'the requested persisted attempt must be read');
  const results = await topologyEvidence.readValidatedWorkerResults({ db, missionId: scope.missionId,
    members: [{ workerId: scope.workerId, executionRunId: 'run-new' }] });
  assert.equal(results[0].executionRunId, 'run-new');
}

async function verifyLatestFallbackDoesNotResurrectSuccess(db) {
  const scope = { missionId: 'mission-retry-failure', workerId: 'worker-retry-failure' };
  await insertAttempt(db, { ...scope, runId: 'run-success-old', outcome: 'success' });
  await insertAttempt(db, { ...scope, runId: 'run-failure-new', outcome: 'unresolved' });
  const evidence = await reader.readEvidence(db, { member: { workerId: scope.workerId }, missionId: scope.missionId });
  assert.equal(evidence.valid, true);
  assert.equal(evidence.receipt.runId, 'run-failure-new', 'legacy lookup must select only the latest attempt');
  assert.equal(evidence.receipt.result.verified, false, 'an older successful receipt must not replace a failed latest attempt');
  const wrongRun = await reader.readEvidence(db, { member: { workerId: scope.workerId,
    executionRunId: 'missing-run' }, missionId: scope.missionId });
  assert.equal(wrongRun.valid, false, 'an absent explicit run must fail closed without latest-run fallback');
}

async function verifyLaunchCarriesNewPersistedRun(db) {
  const { create } = require('../src/services/missionIdentityService');
  const parentId = 'topology-retry-parent';
  const workerId = 'topology-retry-worker';
  const missionId = 'topology-retry-launch-mission';
  await db.run(`INSERT INTO agents (id, name, role, status, agent_type, execution_mode)
    VALUES (?, 'Retry parent', 'orchestrator', 'idle', 'GenOS', 'orchestrator')`, parentId);
  await create(db, { missionId, objective: 'retry binding integration', orchestratorAgentId: parentId });
  const launcher = require('../src/services/topology/workerLauncher.cjs');
  const originalSpawn = childProcess.spawn;
  const originalOpen = detachedSpawn.openRunnerStdio;
  const originalArgs = detachedSpawn.toSpawnArgs;
  const child = new EventEmitter();
  childProcess.spawn = () => {
    setImmediate(async () => {
      child.emit('spawn');
      await insertAttempt(db, { missionId, workerId, runId: 'run-launched', outcome: 'success' });
      child.emit('close', 0);
    });
    return child;
  };
  detachedSpawn.openRunnerStdio = () => ({ stdio: ['ignore', 'ignore', 'ignore'], close() {} });
  detachedSpawn.toSpawnArgs = () => ['--payload-file', 'fixture.json'];
  try {
    const result = await launcher.launchWorker({ db, context: { bridgePath: 'bridge.cjs', repoRoot: process.cwd(),
      orchestratorId: parentId, missionId, task: 'retry binding integration', request: { mode: 'biocenose' } },
    member: { role: 'implementation', mission: 'answer the scoped mission' }, index: 1,
    parent: { workspace_id: null, isolation_mode: 'Branch', model_tier: 'standard' }, suppliedWorkerId: workerId });
    assert.equal(result.executionRunId, 'run-launched', 'launch results must carry the new persisted attempt ID');
  } finally {
    childProcess.spawn = originalSpawn;
    detachedSpawn.openRunnerStdio = originalOpen;
    detachedSpawn.toSpawnArgs = originalArgs;
  }
}

async function main() {
  const db = await database.getDatabase();
  try {
    await biologicalStore.ensure(db);
    await verifyRetrySelection(db);
    await verifyLatestFallbackDoesNotResurrectSuccess(db);
    await verifyLaunchCarriesNewPersistedRun(db);
  } finally {
    await database.closeDatabase();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(`${testDbPath}${suffix}`); } catch (_) {}
    }
  }
  process.stdout.write('Topology worker retry binding checks passed.\n');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
