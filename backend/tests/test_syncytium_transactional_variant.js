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
    budget: 7, inventory: 2, capacity: 1, metadata: { deployment: 'v2' }, idempotencyKey: 'deployment-v2'
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
  const replay = await syncytium.reserveResources(session.sessionId, { ...request, txId: 'reserve-retry-1' });
  assert.equal(replay.replayed, true);
  assert.equal((await syncytium.transactionalSnapshot(session.sessionId)).resources.budget, 13);
  await assert.rejects(() => syncytium.reserveResources(session.sessionId, { ...request, txId: 'reserve-key-reuse', budget: 6 }),
    (error) => error.code === 'SYNCYTIUM_IDEMPOTENCY_KEY_REUSED');
  await assert.rejects(() => syncytium.reserveResources(session.sessionId, { ...request, txId: 'reserve-key-other-actor', actorId: 'intruder' }),
    (error) => error.code === 'SYNCYTIUM_IDEMPOTENCY_KEY_REUSED');
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
  await assert.rejects(() => syncytium.reserveResources(session.sessionId, {
    txId: 'reserve-stale-version', reservationId: 'stale-version', actorId: 'planner', budget: 1, stateVersion: 0
  }), (error) => error.code === 'SYNCYTIUM_PRECONDITION_FAILED');

  const concurrentRetry = await syncytium.createTransactionalSession('Deduplicate concurrent reservation retries.', {
    resources: { budget: { planner: 10 } }
  });
  const duplicateRequests = await Promise.all(['retry-a', 'retry-b'].map((txId) => syncytium.reserveResources(concurrentRetry.sessionId, {
    txId, reservationId: 'one-reservation', actorId: 'planner', budget: 5, idempotencyKey: 'same-request'
  })));
  assert.equal(duplicateRequests.filter((result) => result.replayed).length, 1);
  assert.equal((await syncytium.transactionalSnapshot(concurrentRetry.sessionId)).resources.budget, 5);

  const leases = await syncytium.createTransactionalSession('Expire reservations atomically.', {
    resources: { budget: { planner: 20 } }
  });
  await syncytium.reserveResources(leases.sessionId, { txId: 'lease-short', reservationId: 'short', actorId: 'planner',
    budget: 3, now: 1000, ttlMs: 100 });
  await syncytium.reserveResources(leases.sessionId, { txId: 'lease-long', reservationId: 'long', actorId: 'planner',
    budget: 5, now: 1000, ttlMs: 500 });
  const sweep = await syncytium.sweepExpiredReservations(leases.sessionId, { txId: 'sweep-expired', now: 1100 });
  assert.deepEqual(sweep.swept, ['short']);
  const afterSweep = await syncytium.transactionalSnapshot(leases.sessionId);
  assert.equal(afterSweep.resources.budget, 15);
  assert.equal(afterSweep.resources.reservations.short, undefined);
  assert.equal(afterSweep.resources.reservations.long.budget, 5);

  const actors = Array.from({ length: 15 }, (_, index) => `actor-${index}`);
  const allocations = Object.fromEntries(actors.map((actor) => [actor, 2]));
  const inventoryAllocations = Object.fromEntries(actors.map((actor) => [actor, 1]));
  const concurrency = await syncytium.createTransactionalSession('Reserve three scarce resources concurrently.', {
    resources: { budget: allocations, inventory: inventoryAllocations, capacity: inventoryAllocations }
  });
  const concurrent = await Promise.all(actors.map((actor) => syncytium.reserveResources(concurrency.sessionId, {
    txId: `reserve-${actor}`, reservationId: `reservation-${actor}`, actorId: actor,
    budget: 2, inventory: 1, capacity: 1, idempotencyKey: `key-${actor}`
  })));
  assert.equal(concurrent.filter((result) => !result.replayed).length, 15);
  const concurrentState = await syncytium.transactionalSnapshot(concurrency.sessionId);
  assert.equal(concurrentState.resources.budget, 0);
  assert.equal(concurrentState.resources.inventory, 0);
  assert.equal(concurrentState.resources.capacity, 0);
  const deadlock = syncytium.detectReservationDeadlock([
    { waiter: 'A', holder: 'B' }, { waiter: 'B', holder: 'C' }, { waiter: 'C', holder: 'A' }
  ]);
  assert.equal(deadlock.deadlocked, true);
  assert.equal(deadlock.cycle.length, 4);
  assert.equal(deadlock.cycle[0], deadlock.cycle.at(-1));
}

main().then(() => console.log('Syncytium transactional variant checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
