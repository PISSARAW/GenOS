'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createTransactionalSession('Reserve bounded resources atomically.', {
    resources: {
      budget: { planner: 20 }, inventory: { planner: 8 }, capacity: { planner: 4 }
    }
  });
  const request = {
    txId: 'reserve-release-1', reservationId: 'deployment-1', actorId: 'planner',
    budget: 7, inventory: 2, capacity: 1, metadata: { deployment: 'v2' }
  };
  const reserved = await syncytium.reserveResources(session.sessionId, request);
  assert.equal(reserved.snapshot.sharedFields.budget, 13);
  assert.equal(reserved.snapshot.sharedFields.inventory, 6);
  assert.equal(reserved.snapshot.sharedFields.capacity, 3);
  assert.deepEqual(reserved.operationIds.map((id) => id.split(':').at(-1)), [
    'budget', 'inventory', 'capacity', 'reservation'
  ]);

  const state = await syncytium.transactionalSnapshot(session.sessionId);
  assert.equal(state.resources.reservations['deployment-1'].metadata.deployment, 'v2');
  await assert.rejects(() => syncytium.reserveResources(session.sessionId, {
    txId: 'reserve-too-much', reservationId: 'deployment-2', actorId: 'planner', capacity: 4
  }), (error) => error.code === 'SYNCYTIUM_CRDT_OPERATION_INVALID');
  assert.equal((await syncytium.transactionalSnapshot(session.sessionId)).resources.budget, 13);
  assert.equal((await syncytium.snapshot(session.sessionId)).shared.logSize, 4);

  const released = await syncytium.releaseReservation(session.sessionId, {
    txId: 'release-deployment-1', reservationId: 'deployment-1', actorId: 'planner'
  });
  assert.equal(released.snapshot.sharedFields.budget, 20);
  assert.equal(released.snapshot.sharedFields.inventory, 8);
  assert.equal(released.snapshot.sharedFields.capacity, 4);
  assert.equal((await syncytium.transactionalSnapshot(session.sessionId)).resources.reservations['deployment-1'], undefined);
  await assert.rejects(() => syncytium.releaseReservation(session.sessionId, {
    txId: 'release-unknown', reservationId: 'deployment-1', actorId: 'planner'
  }), (error) => error.code === 'SYNCYTIUM_RESERVATION_NOT_FOUND');
}

main().then(() => console.log('Syncytium transactional variant checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
