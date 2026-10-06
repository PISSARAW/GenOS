'use strict';

const assert = require('assert');
const fabric = require('../src/services/garageFabricService');

function run() {
  assert.deepEqual(fabric.MODES, [
    'surface', 'ramp', 'stacker', 'puzzle', 'tower', 'carousel',
    'reciprocal_lift', 'shuttle', 'agv', 'pallet', 'cold_storage', 'collector'
  ]);
  assert.equal(fabric.chooseMode({ mode: 'agv' }).mode, 'agv');

  const admission = fabric.planAdmission({ available: 0, urgency: 0.95, preemptible: true, activeWorkers: [
    { id: 'worker-low', status: 'running', priority: 0.1, preemptible: true, snapshotCapable: true },
    { id: 'worker-safe', status: 'quarantined', priority: 0 }
  ] });
  assert.equal(admission.decision, 'preempt');
  assert.deepEqual(admission.preemptWorkerIds, ['worker-low']);

  const queue = fabric.createQueue();
  queue.enqueue({ requestId: 'low', priority: 0.1, enqueuedAt: 1 });
  queue.enqueue({ requestId: 'urgent', priority: 0.9, enqueuedAt: 2 });
  assert.equal(queue.next().requestId, 'urgent');
  assert.equal(queue.remove('urgent').requestId, 'urgent');

  const lease = fabric.createLease({ orchestratorId: 'orch', workerId: 'worker', now: 1000, ttlMs: 1000 });
  assert.equal(fabric.leaseExpired(lease, 1999), false);
  assert.equal(fabric.leaseExpired(lease, 2000), true);
  assert.throws(() => fabric.renewLease(lease, { now: 2000 }), { code: 'GARAGE_LEASE_EXPIRED' });

  const snapshot = fabric.buildSnapshotPlan({ activeWorkers: [{ id: 'worker-a', status: 'running', priority: 0.2, preemptible: true, snapshotCapable: true }] });
  assert.equal(snapshot.mustVerifySnapshot, true);
  console.log('Garage Fabric checks passed.');
}

run();
