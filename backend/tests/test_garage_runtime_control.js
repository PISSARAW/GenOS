'use strict';

const assert = require('assert/strict');
const { fixture, request } = require('./garageFixture');
const store = require('../src/services/garageQueueStore');
const { control } = require('../src/services/garageQueueControl');
const runtime = require('../src/services/garageRuntimeService');
const admission = require('../src/services/garageAdmissionService');
const garage = require('../src/services/workerGarageService');

async function controls(test) {
  const row = await store.enqueuePersistent(test.db, request({ mode: 'cold_storage' }));
  const input = { db: test.db, orchestratorId: 'orch', requestId: row.request_id, authorize: async () => true };
  assert.equal((await control({ ...input, action: 'resume' })).status, 'queued');
  assert.equal((await test.db.get('SELECT phase FROM garage_queue WHERE request_id = ?', row.request_id)).phase, 'ready');
  assert.equal((await control({ ...input, action: 'cancel' })).status, 'cancelled');
  assert.equal((await control({ ...input, action: 'cancel' })).cancelled, false, 'terminal state is reported honestly');
  assert.equal(await store.claimNextPersistent(test.db, { orchestratorId: 'orch' }), null);
  await assert.rejects(control({ ...input, orchestratorId: 'foreign', action: 'cancel' }), { code: 'AGENT_NOT_FOUND' });
  await assert.rejects(control({ ...input, action: 'invented' }), { code: 'GARAGE_ACTION_INVALID' });
}

async function adoption(test) {
  await test.db.run("UPDATE agents SET status = 'running' WHERE id = 'worker-2'");
  const mission = { agentId: 'worker-2', orchestratorAgentId: 'orch', role: 'implementation', prompt: 'bounded external mission' };
  await admission.adopt({ db: test.db, agentId: 'worker-2', normalizedMission: mission,
    dispatchedAgent: { execution_mode: 'worker', status: 'running' } });
  await runtime.stop(test.db);
  assert.ok(mission.garageRequestId);
  await runtime.assertLease(test.db, mission);
  assert.equal(await garage.enterIdleState(test.db, 'worker-2', 'orch'), false, 'an old callback cannot idle an active durable request');
  assert.equal(await garage.releaseSlot(test.db, { orchestratorId: 'orch', workerId: 'worker-2' }), false);
  await assert.rejects(admission.adopt({ db: test.db, agentId: 'worker-2', normalizedMission: { ...mission, garageRequestId: undefined },
    dispatchedAgent: { execution_mode: 'worker', status: 'running' } }), { code: 'GARAGE_DUPLICATE_RUNTIME' });
  const cancelled = await control({ db: test.db, orchestratorId: 'orch', requestId: mission.garageRequestId,
    action: 'cancel', authorize: async () => true, stopVerified: async () => true });
  assert.equal(cancelled.status, 'cancelled');
  await assert.rejects(runtime.assertLease(test.db, mission), { code: 'GARAGE_STALE_LEASE' });
}

async function reservation(test) {
  garage.setDynamicCapacity('orch', 1);
  const row = await store.enqueuePersistent(test.db, request({ workerId: 'worker-3' }));
  const options = { orchestratorId: 'orch', workerId: 'worker-3', name: 'bounded', role: 'implementation', mission: 'bounded' };
  try {
    await assert.rejects(garage.reserveSlot(test.db, options), { code: 'WORKER_RESERVED_BY_QUEUE' });
    const claim = await store.claimNextPersistent(test.db, { orchestratorId: 'orch' });
    assert.equal(claim.request_id, row.request_id);
    await assert.rejects(garage.reserveSlot(test.db, { ...options, garageRequestId: row.request_id, garageLeaseId: 'stale' }), { code: 'GARAGE_STALE_CLAIM' });
    assert.equal((await garage.reserveSlot(test.db, { ...options, garageRequestId: row.request_id, garageLeaseId: claim.lease_id })).occupied, 1);
    await store.updatePersistent(test.db, { requestId: row.request_id, leaseId: claim.lease_id, status: 'failed' });
    assert.equal(await garage.enterIdleState(test.db, 'worker-3', 'orch'), true);
  } finally { garage.releaseDynamicCapacity('orch'); }
}

async function run() {
  const test = await fixture();
  try { await controls(test); await adoption(test); await reservation(test); }
  finally { await runtime.stop(test.db); await test.close(); }
  console.log('Garage controls: scoped wake/cancel, honest terminal response, runtime adoption and revoked launch passed.');
}

run().catch((failure) => { console.error(failure); process.exitCode = 1; });
