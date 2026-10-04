'use strict';

const { randomUUID } = require('node:crypto');

function nativeOfflinePolicy(policy) {
  return {
    ALLOW_LOCAL_MUTATION: 'ALLOW_LOCAL_MUTATION', ALLOW_READ_ONLY: 'ALLOW_READ_ONLY',
    QUEUE_OPERATION: 'QUEUE_UNTIL_CONNECTED', REJECT_OPERATION: 'REJECT'
  }[policy];
}

async function reconcileReplica(context, vectorClock) {
  const { sessionId, options, syncytium } = context;
  const replicaId = options.replicaId;
  const result = await syncytium.reconcileReplica(sessionId, replicaId, { frontier: vectorClock, options });
  const snapshot = await syncytium.snapshot(sessionId, options);
  const acceptedIds = new Set(result.accepted || []);
  const entries = (snapshot.shared.sharedFields.deltas || [])
    .filter((delta) => acceptedIds.has(delta.operationId) || acceptedIds.has(delta.deltaId))
    .map((delta) => ({ deltaId: delta.deltaId, reconciledAt: Date.now(), author: delta.author,
      vectorClock: delta.vectorClock, metadata: { reconciledBy: 'replica-anti-entropy', replicaId } }));
  for (const entry of entries) await syncytium.applyOperation(sessionId, {
    opId: `${options.opId || randomUUID()}:${entry.deltaId}`, actorId: 'anti-entropy-daemon',
    kind: { type: 'typed_field', key: 'antiEntropyLog', action: 'add', value: entry }
  }, options);
  return { reconciled: result.accepted.length, accepted: result.accepted,
    replicaId, status: result.status, snapshot: result.snapshot };
}

async function assertReadableDuringPartition(sessionId, options, syncytium) {
  if (!options.replicaId) return;
  const snapshot = await syncytium.snapshot(sessionId, options);
  const partition = snapshot.shared.sharedFields.partitions?.[options.replicaId];
  if (partition?.expiresAt > Date.now() && partition.policy === 'REJECT_OPERATION') {
    throw Object.assign(new Error('The active partition policy rejects reads and mutations.'), { code: 'SYNCYTIUM_PARTITION_READ_REJECTED' });
  }
}

function uniqueDeltas(deltas) {
  return [...new Map(deltas.filter((delta) => delta?.deltaId).map((delta) => [delta.deltaId, delta])).values()];
}

function partitionCapabilities(policy) {
  return {
    ALLOW_LOCAL_MUTATION: { read: true, mutateLocally: true, queue: false, replicate: false },
    ALLOW_READ_ONLY: { read: true, mutateLocally: false, queue: false, replicate: false },
    QUEUE_OPERATION: { read: true, mutateLocally: false, queue: true, replicate: false },
    REJECT_OPERATION: { read: false, mutateLocally: false, queue: false, replicate: false }
  }[policy];
}

module.exports = { nativeOfflinePolicy, reconcileReplica, assertReadableDuringPartition, uniqueDeltas, partitionCapabilities };
