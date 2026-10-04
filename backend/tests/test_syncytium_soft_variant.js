'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createSoftSession('Reconcile divergent replicas after partitions.');
  const sessionId = session.sessionId;
  const replicas = [
    ['local', 'actor-local', 'ALLOW_LOCAL_MUTATION'],
    ['readonly', 'actor-readonly', 'ALLOW_READ_ONLY'],
    ['queued', 'actor-queued', 'QUEUE_OPERATION'],
    ['rejected', 'actor-rejected', 'REJECT_OPERATION']
  ];
  for (const [replicaId, actorId] of replicas) {
    await syncytium.joinReplica(sessionId, { replicaId, actorId });
  }
  await syncytium.setStalenessBudget({ sessionId, budget: 3, options: { actorId: 'admin' } });
  assert.equal((await syncytium.getStalenessBudget({ sessionId, options: {} })).budget, 3);

  for (const [replicaId, actorId, policy] of replicas) {
    await syncytium.simulatePartition({ sessionId, policy, durationMs: 60000,
      options: { replicaId, actorId } });
  }
  const local = await syncytium.applyDelta({ sessionId, delta: { type: 'set', deltaId: 'd-local', value: 'local' },
    options: { replicaId: 'local', actorId: 'actor-local', opId: 'op-local' } });
  assert.equal(local.localOnly, true);
  const queued = await syncytium.applyDelta({ sessionId, delta: { type: 'set', deltaId: 'd-queued', value: 'queued' },
    options: { replicaId: 'queued', actorId: 'actor-queued', opId: 'op-queued' } });
  assert.equal(queued.queued, true);
  await assert.rejects(() => syncytium.applyDelta({ sessionId, delta: { type: 'set', deltaId: 'd-readonly' },
    options: { replicaId: 'readonly', actorId: 'actor-readonly', opId: 'op-readonly' } }),
  (error) => error.code === 'SYNCYTIUM_OFFLINE_READ_ONLY');
  await assert.rejects(() => syncytium.applyDelta({ sessionId, delta: { type: 'set', deltaId: 'd-rejected' },
    options: { replicaId: 'rejected', actorId: 'actor-rejected', opId: 'op-rejected' } }),
  (error) => error.code === 'SYNCYTIUM_OFFLINE_REJECTED');
  await assert.rejects(() => syncytium.softSnapshot({ sessionId, options: { replicaId: 'rejected' } }),
    (error) => error.code === 'SYNCYTIUM_PARTITION_READ_REJECTED');

  const sharedBefore = await syncytium.snapshot(sessionId);
  assert.equal((sharedBefore.shared.sharedFields.deltas || []).some((delta) => delta.deltaId === 'd-local'), false);
  const reconciliation = await syncytium.reconcileAntiEntropy({ sessionId, vectorClock: {},
    options: { replicaId: 'local', actorId: 'actor-local' } });
  assert.equal(reconciliation.reconciled, 1);
  const sharedAfter = await syncytium.snapshot(sessionId);
  assert.equal((sharedAfter.shared.sharedFields.deltas || []).some((delta) => delta.deltaId === 'd-local'), true);
  console.log('Syncytium soft partition and anti-entropy checks: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
