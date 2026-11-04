'use strict';
const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const runtime = require('../src/services/aTeam/aTeamRuntime');
const store = require('../src/services/aTeam/teamRunStore');
const { requireLease, withRunnerLease } = require('../src/services/aTeam/execution/runnerLeaseService');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function begin(db, missionId) {
  const created = await runtime.createRun({ db, missionId, idempotencyKey: missionId, goal: 'Lease transport test',
    status: 'READY', phase: 'PREBRIEF', members: [{ subSystem: 'author', role: 'engineer', outputs: ['draft'] }] });
  const running = await runtime.transitionRun({ db, teamRunId: created.run.teamRunId, revision: created.run.revision,
    patch: { status: 'RUNNING', phase: 'EXECUTION' } });
  const claimed = await runtime.claimExecution({ db, teamRunId: running.teamRunId });
  return { db, teamRunId: running.teamRunId, runnerToken: claimed.token, heartbeatMs: 5 };
}
async function changeLease(input, patch) {
  const run = await store.load(input.db, input.teamRunId);
  return store.update({ db: input.db, teamRunId: run.teamRunId, revision: run.revision,
    patch: { execution: { ...run.execution, runnerLease: { ...run.execution.runnerLease, ...patch } } } });
}
async function awaitingWorker(db) {
  const input = await begin(db, 'long-worker');
  const result = await withRunnerLease(input, async () => {
    await changeLease(input, { expiresAt: new Date(Date.now() + 30000).toISOString() });
    for (let attempt = 0; attempt < 40; attempt++) {
      await sleep(25);
      const run = await store.load(db, input.teamRunId);
      if (Date.parse(run.execution.runnerLease.expiresAt) > Date.now() + 600000) return 'worker-returned';
    }
    assert.fail('The lease must renew while the worker callback is still awaiting.');
  });
  assert.equal(result, 'worker-returned');
  const stoppedExpiry = new Date(Date.now() + 30000).toISOString();
  await changeLease(input, { expiresAt: stoppedExpiry });
  await sleep(30);
  assert.equal((await store.load(db, input.teamRunId)).execution.runnerLease.expiresAt, stoppedExpiry);
}
async function superseded(db) {
  const input = await begin(db, 'superseded-worker');
  const expiresAt = new Date(Date.now() + 600000).toISOString();
  await assert.rejects(withRunnerLease(input, async () => {
    await changeLease(input, { token: 'new-owner', expiresAt });
    await sleep(30);
  }), { code: 'ATEAM_RUN_LEASE_LOST' });
  const lease = (await store.load(db, input.teamRunId)).execution.runnerLease;
  assert.equal(lease.token, 'new-owner');
  assert.equal(lease.expiresAt, expiresAt);
}
async function expired(db) {
  const input = await begin(db, 'expired-worker');
  const expiresAt = new Date(Date.now() - 1000).toISOString();
  await changeLease(input, { expiresAt });
  let called = false;
  await assert.rejects(withRunnerLease(input, async () => { called = true; }), { code: 'ATEAM_RUN_LEASE_LOST' });
  assert.equal(called, false);
  assert.equal((await store.load(db, input.teamRunId)).execution.runnerLease.expiresAt, expiresAt);
}
function delayedWrite(db) {
  return new Proxy(db, { get(target, key) {
    if (key === 'run') return async (...args) => {
      if (args[0].includes("state_json=json_set(state_json,'$.execution.runnerLease.expiresAt'")) await sleep(750);
      return target.run(...args);
    };
    const value = Reflect.get(target, key);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}
async function expiresBeforeWrite(db) {
  const input = await begin(db, 'expires-during-update');
  const expiresAt = new Date(Date.now() + 500).toISOString();
  await changeLease(input, { expiresAt });
  await assert.rejects(requireLease({ ...input, db: delayedWrite(db) }), { code: 'ATEAM_RUN_LEASE_LOST' });
  assert.equal((await store.load(db, input.teamRunId)).execution.runnerLease.expiresAt, expiresAt);
}
async function actionFailure(db) {
  const input = await begin(db, 'failed-worker');
  const failure = Object.assign(new Error('Provider outcome unknown'), { code: 'PROVIDER_UNKNOWN' });
  await assert.rejects(withRunnerLease(input, async () => { throw failure; }), error => error === failure);
  const expiresAt = new Date(Date.now() + 30000).toISOString();
  await changeLease(input, { expiresAt });
  await sleep(30);
  assert.equal((await store.load(db, input.teamRunId)).execution.runnerLease.expiresAt, expiresAt);
}
async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try { await awaitingWorker(db); await superseded(db); await expired(db); await expiresBeforeWrite(db); await actionFailure(db); }
  finally { await db.close(); }
  console.log('A-Team runner lease: heartbeat during awaited work, cleanup, owner loss and atomic expiry refusal PASS (real SQLite).');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
