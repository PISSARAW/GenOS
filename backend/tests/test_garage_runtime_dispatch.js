'use strict';

const assert = require('assert/strict');
const { fixture, request } = require('./garageFixture');
const dispatcher = require('../src/services/garageQueueDispatcher');
const store = require('../src/services/garageQueueStore');
const runtime = require('../src/services/garageRuntimeService');
const garage = require('../src/services/workerGarageService');

async function ackIsNotEvidence(test) {
  const row = await store.enqueuePersistent(test.db, request());
  let launches = 0;
  const input = { db: test.db, orchestratorId: 'orch', authorize: async () => true,
    startMission: async () => { launches++; return { started: true, verified: true }; } };
  const launch = await dispatcher.drainOne(input);
  assert.equal(launch.started, true);
  await launch.completion;
  assert.equal((await test.db.get('SELECT status FROM garage_queue WHERE request_id = ?', row.request_id)).status, 'running');
  assert.equal(await dispatcher.drainOne(input), null);
  assert.equal(launches, 1);
  await assert.rejects(runtime.assertLease(test.db, { agentId: 'worker-1', garageRequestId: row.request_id, garageLeaseId: 'old' }), { code: 'GARAGE_STALE_LEASE' });
  await test.db.run("UPDATE agents SET status = 'error' WHERE id = 'worker-1'");
  await runtime.reconcileOne(input, row.request_id);
  const failed = await test.db.get('SELECT status, error_text FROM garage_queue WHERE request_id = ?', row.request_id);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error_text, 'runtime_terminal_without_verified_evidence');
}

async function backpressure(test) {
  garage.setDynamicCapacity('orch', 1);
  await test.db.run("UPDATE agents SET status = 'running' WHERE id = 'worker-2'");
  const row = await store.enqueuePersistent(test.db, request({ workerId: 'worker-3' }));
  const input = { db: test.db, orchestratorId: 'orch', authorize: async () => true,
    startMission: async () => { throw new Error('launcher must not run'); } };
  assert.equal(await dispatcher.drainOne(input), null);
  assert.equal((await test.db.get('SELECT status FROM garage_queue WHERE request_id = ?', row.request_id)).status, 'queued');
  await test.db.run("UPDATE agents SET status = 'idle' WHERE id = 'worker-2'");
  input.startMission = async () => { throw new Error('executor unavailable'); };
  const launch = await dispatcher.drainOne(input);
  await launch.completion;
  assert.equal((await test.db.get("SELECT status FROM agents WHERE id = 'worker-3'")).status, 'idle');
  assert.equal((await test.db.get('SELECT status FROM garage_queue WHERE request_id = ?', row.request_id)).status, 'failed');
  garage.releaseDynamicCapacity('orch');
}

async function authorityRevoked(test) {
  const row = await store.enqueuePersistent(test.db, request({ workerId: 'worker-4' }));
  const result = await dispatcher.drainOne({ db: test.db, orchestratorId: 'orch',
    authorize: async () => { throw Object.assign(new Error('Revoked'), { code: 'AGENT_QUARANTINED' }); },
    startMission: async () => { throw new Error('must not launch'); } });
  assert.equal(result.started, false);
  assert.equal((await test.db.get('SELECT status FROM garage_queue WHERE request_id = ?', row.request_id)).status, 'failed');
  assert.equal((await test.db.get("SELECT status FROM agents WHERE id = 'worker-4'")).status, 'idle');
}

async function run() {
  const test = await fixture();
  try { await ackIsNotEvidence(test); await backpressure(test); await authorityRevoked(test); }
  finally { garage.releaseDynamicCapacity('orch'); await test.close(); }
  console.log('Garage runtime dispatch: ACK rejection, stale lease, backpressure, compensation and fresh authority passed.');
}

run().catch((failure) => { console.error(failure); process.exitCode = 1; });
