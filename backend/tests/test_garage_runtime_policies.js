'use strict';

const assert = require('assert/strict');
const { fixture, request } = require('./garageFixture');
const store = require('../src/services/garageQueueStore');
const policies = require('../src/services/garagePolicies');

function orderChecks() {
  const now = Date.parse('2026-01-01T12:00:00Z');
  const context = { now, served: { orch: 3, other: 0 } };
  const row = (mode, patch = {}) => ({ mode, priority: 0.5, orchestrator_id: 'orch',
    created_at: '2026-01-01 11:59:00', request_json: '{}', ...patch });
  assert.ok(policies.score(row('surface', { created_at: '2026-01-01 11:58:00' }), context) > policies.score(row('surface'), context));
  assert.ok(policies.score(row('stacker'), context) > policies.score(row('stacker', { created_at: '2026-01-01 11:58:00' }), context));
  assert.ok(policies.score(row('stacker', { created_at: '2026-01-01 11:00:00' }), context) > policies.score(row('stacker'), context));
  assert.ok(policies.score(row('carousel', { orchestrator_id: 'other' }), context) > policies.score(row('carousel'), context));
  assert.ok(policies.score(row('reciprocal_lift', { request_json: '{"urgency":1}' }), context) > policies.score(row('reciprocal_lift'), context));
  assert.ok(policies.score(row('agv', { request_json: '{"estimatedCost":1}' }), context) > policies.score(row('agv', { request_json: '{"estimatedCost":2}' }), context));
}

async function modes(test) {
  for (const mode of Object.keys(policies.POLICIES)) {
    const row = await store.enqueuePersistent(test.db, request({ mode }));
    assert.equal(JSON.parse(row.policy_json).mode, mode);
    const claim = await store.claimNextPersistent(test.db, { orchestratorId: 'orch' });
    assert.equal(Boolean(claim), mode !== 'cold_storage', mode);
    if (claim) await store.updatePersistent(test.db, { requestId: claim.request_id, leaseId: claim.lease_id, status: 'failed' });
    else await test.db.run("UPDATE garage_queue SET status = 'cancelled' WHERE request_id = ?", row.request_id);
  }
  await assert.rejects(store.enqueuePersistent(test.db, request({ mode: 'invented' })), { code: 'GARAGE_MODE_INVALID' });
  await test.db.run("UPDATE agents SET isolation_mode = 'Shared' WHERE id = 'worker-1'");
  await assert.rejects(store.enqueuePersistent(test.db, request({ mode: 'pallet' })), { code: 'GARAGE_ISOLATION_REQUIRED' });
  await test.db.run("UPDATE agents SET isolation_mode = 'Branch' WHERE id = 'worker-1'");
}

async function dependenciesAndLanes(test) {
  const dependent = await store.enqueuePersistent(test.db, request({ mode: 'ramp', dependsOn: ['upstream'] }));
  assert.equal(await store.claimNextPersistent(test.db, { orchestratorId: 'orch' }), null);
  await test.db.run("UPDATE garage_queue SET status = 'completed', request_id = 'upstream' WHERE request_id = ?", dependent.request_id);
  const ready = await store.enqueuePersistent(test.db, request({ mode: 'ramp', dependsOn: ['upstream'] }));
  const claim = await store.claimNextPersistent(test.db, { orchestratorId: 'orch' });
  assert.equal(claim.request_id, ready.request_id);
  await store.updatePersistent(test.db, { requestId: claim.request_id, leaseId: claim.lease_id, status: 'failed' });
  const stacked = await store.enqueuePersistent(test.db, request({ mode: 'stacker', lane: 'lane' }));
  const active = await store.claimNextPersistent(test.db, { orchestratorId: 'orch' });
  await store.updatePersistent(test.db, { requestId: active.request_id, leaseId: active.lease_id, status: 'running' });
  await store.enqueuePersistent(test.db, request({ mode: 'stacker', lane: 'lane', workerId: 'worker-2' }));
  assert.equal(await store.claimNextPersistent(test.db, { orchestratorId: 'orch' }), null, 'stacker serializes its lane');
  assert.equal(stacked.request_id, active.request_id);
}

async function run() {
  orderChecks();
  const test = await fixture();
  try { await modes(test); await dependenciesAndLanes(test); }
  finally { await test.close(); }
  console.log('Garage policies: all twelve modes, bounded aging, fairness, dependencies, lanes and isolation passed.');
}

run().catch((failure) => { console.error(failure); process.exitCode = 1; });
