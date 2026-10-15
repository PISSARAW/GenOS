'use strict';

const assert = require('node:assert/strict');
const { readMissionWorkerRuntimeSnapshot } = require('../src/services/agentRuntimeAdapter/missionWorkerRuntimeSnapshot');

function mockDb(rows = []) {
  const statements = [];
  return {
    statements,
    async get(sql) { statements.push(sql); return { name: 'present' }; },
    async all(sql, ...params) { statements.push(sql); assert.deepEqual(params, ['worker-1']); return rows; }
  };
}

async function testUnknownWithoutIdentity() {
  const snapshot = await readMissionWorkerRuntimeSnapshot({}, [{ workerKind: 'verifier_worker' }], 1000);
  assert.equal(snapshot.status, 'unknown');
  assert.equal(snapshot.reason, 'runtime_tables_or_instance_ids_missing');
}

async function testIdleObservationIsNotAdmission() {
  const db = mockDb([{ id: 'worker-1', status: 'idle', execution_mode: 'worker' }]);
  const snapshot = await readMissionWorkerRuntimeSnapshot(db, [{ id: 'worker-1' }], 1000);
  assert.equal(snapshot.status, 'idle_observed');
  assert.equal(snapshot.workers[0].status, 'idle_observed');
  assert.equal(snapshot.workers[0].reason, 'database_status_only');
  assert.match(snapshot.limitation, /does_not_prove_process_liveness_or_admission/);
  assert.ok(db.statements.every((sql) => /^SELECT/i.test(sql.trim())));
}

async function testBusyWorkerAndLease() {
  const db = mockDb([{ id: 'worker-1', status: 'running', execution_mode: 'worker',
    queue_status: 'running', queue_phase: 'ready', lease_id: 'lease-1',
    lease_expires_at: '1970-01-01T00:00:02.000Z' }]);
  const snapshot = await readMissionWorkerRuntimeSnapshot(db, [{ workerId: 'worker-1' }], 1000);
  assert.equal(snapshot.status, 'constrained');
  assert.equal(snapshot.workers[0].status, 'busy');
}

async function testExpiredLeaseRemainsUnknown() {
  const db = mockDb([{ id: 'worker-1', status: 'idle', execution_mode: 'worker',
    queue_status: 'running', queue_phase: 'ready', lease_id: 'lease-1',
    lease_expires_at: '1970-01-01T00:00:00.500Z' }]);
  const snapshot = await readMissionWorkerRuntimeSnapshot(db, [{ agentId: 'worker-1' }], 1000);
  assert.equal(snapshot.status, 'unknown');
  assert.equal(snapshot.workers[0].status, 'unknown');
}

Promise.resolve().then(testUnknownWithoutIdentity).then(testIdleObservationIsNotAdmission)
  .then(testBusyWorkerAndLease).then(testExpiredLeaseRemainsUnknown)
  .then(() => console.log('mission worker runtime snapshot: PASS'))
  .catch((error) => { console.error(error); process.exitCode = 1; });
