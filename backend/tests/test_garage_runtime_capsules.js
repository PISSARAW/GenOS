'use strict';

const assert = require('assert/strict');
const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { once } = require('events');
const { fixture, request } = require('./garageFixture');
const store = require('../src/services/garageQueueStore');
const preemption = require('../src/services/garagePreemptionService');
const processes = require('../src/services/garageProcessControl');
const capsules = require('../src/services/garageCapsuleService');
const lifecycle = require('../src/services/agentWorkspaceLifecycleService');

async function processProbe(test) {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore', windowsHide: true });
  await once(child, 'spawn');
  await test.db.run("UPDATE agents SET runtime_pid = ? WHERE id = 'worker-1'", child.pid);
  try {
    await assert.rejects(processes.stopVerified({ db: test.db, workerId: 'worker-1', timeoutMs: 100,
      stopMission: async () => true }), { code: 'GARAGE_STOP_UNVERIFIED' });
    assert.equal(processes.pidAlive(child.pid), true);
    const closed = once(child, 'exit');
    child.kill();
    await closed;
    await test.db.run("UPDATE agents SET runtime_pid = NULL WHERE id = 'worker-1'");
    assert.equal(await processes.stopVerified({ db: test.db, workerId: 'worker-1', stopMission: async () => false }), true);
  } finally { if (child.exitCode === null) child.kill(); }
}

async function roundtrip(test) {
  const root = path.join(test.directory, '.genos-agent-worlds', 'worker-1');
  assert.throws(() => capsules.assertWorkerSource(root, 'foreign'), { code: 'GARAGE_SCOPE_INVALID' });
  assert.throws(() => capsules.assertWorkerSource(path.join(test.directory, 'worker-1'), 'worker-1'), { code: 'GARAGE_ISOLATION_REQUIRED' });
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, 'work.txt'), 'verified partial work');
  await lifecycle.trackWorkspace('worker-1', root);
  const row = await store.enqueuePersistent(test.db, request({ preemptible: true, executionBudget: { tokens: 100 } }));
  const claim = await store.claimNextPersistent(test.db, { orchestratorId: 'orch' });
  await store.updatePersistent(test.db, { requestId: row.request_id, leaseId: claim.lease_id, status: 'running', result: { runId: 'partial' } });
  await test.db.run("INSERT INTO strategy_execution_runs(id,agent_id,status,metrics_json,budget_json) VALUES ('partial','worker-1','running', ?, ?)",
    JSON.stringify({ tokens: 40 }), JSON.stringify({ tokens: 100 }));
  await test.db.run("UPDATE agents SET status = 'running' WHERE id = 'worker-1'");
  const input = { db: test.db, workerId: 'worker-1', orchestratorId: 'orch', authorize: async () => true,
    stopMission: async () => {
      await lifecycle.scheduleWorkspaceCleanup('worker-1', 0);
      assert.equal(await require('../src/services/garageCapsuleRetention').retained(test.db, 'worker-1'), true);
      return false;
    } };
  const frozen = await preemption.freezeWorker(input);
  assert.equal(frozen.runtimeStopped, true);
  assert.equal((await test.db.get('SELECT phase FROM garage_queue WHERE request_id = ?', row.request_id)).phase, 'frozen');
  await fs.rm(root, { recursive: true, force: true });
  const saved = await test.db.get('SELECT * FROM garage_capsules WHERE snapshot_id = ?', frozen.snapshotId);
  await test.db.run("UPDATE garage_capsules SET capsule_hash = 'tampered' WHERE snapshot_id = ?", frozen.snapshotId);
  await assert.rejects(preemption.thawWorker({ ...input, snapshotId: frozen.snapshotId }), { code: 'GARAGE_CAPSULE_CORRUPT' });
  assert.equal((await test.db.get("SELECT status FROM agents WHERE id = 'worker-1'")).status, 'blocked');
  await test.db.run('UPDATE garage_capsules SET capsule_hash = ? WHERE snapshot_id = ?', saved.capsule_hash, frozen.snapshotId);
  const thawed = await preemption.thawWorker({ ...input, snapshotId: frozen.snapshotId });
  assert.equal(thawed.status, 'queued');
  const restored = JSON.parse((await test.db.get('SELECT request_json FROM garage_queue WHERE request_id = ?', row.request_id)).request_json);
  assert.equal(await fs.readFile(path.join(restored.workspaceRoot, 'work.txt'), 'utf8'), 'verified partial work');
  assert.equal(restored.executionBudget.tokens, 60, 'thaw uses persisted allocation minus consumption');
  await assert.rejects(preemption.thawWorker({ ...input, snapshotId: frozen.snapshotId }), { code: 'GARAGE_CAPSULE_NOT_FOUND' });
  assert.deepEqual(capsules.remainingBudget({ request: { executionBudget: { tokens: 100, costUsd: 2 } }, consumed: { tokens: 40, costUsd: 0.5 } }), { tokens: 60, costUsd: 1.5 });
  assert.throws(() => capsules.remainingBudget({ request: { executionBudget: { tokens: 1 } }, consumed: { tokens: 2 } }), { code: 'GARAGE_BUDGET_EXHAUSTED' });
  assert.throws(() => capsules.remainingBudget({ request: { executionBudget: { tokens: 100 } }, consumed: {} }), { code: 'GARAGE_BUDGET_UNKNOWN' });
  assert.throws(() => capsules.remainingBudget({ request: { executionBudget: { tokens: 100 } }, consumed: { tokens: -1 } }), { code: 'GARAGE_BUDGET_UNKNOWN' });
}

async function run() {
  const test = await fixture();
  try { await processProbe(test); await roundtrip(test); }
  finally { await test.close(); }
  console.log('Garage capsules: real process stop, durable payload, corruption rejection, thaw and remaining budget passed.');
}

run().catch((failure) => { console.error(failure); process.exitCode = 1; });
