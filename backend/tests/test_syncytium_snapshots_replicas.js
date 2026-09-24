'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');
const { createSyncytiumCrdt } = require('../src/services/syncytiumCrdtService');

async function main() {
  await verifyCompactionAndRecovery();
  await verifyReplicaStability();
}

async function verifyCompactionAndRecovery() {
  const session = await syncytium.createSession('Snapshot and compact shared state.');
  const first = { opId: 'snapshot-op-1', actorId: 'alpha', kind: { type: 'set_field', key: 'value', value: 1 } };
  await syncytium.applyOperation(session.sessionId, first);
  const snapshot = await syncytium.createSnapshot(session.sessionId);
  assert.equal(snapshot.stateVersion, 1);
  assert.equal(snapshot.shared.sharedFields.value, 1);

  const compacted = await syncytium.compactHistory(session.sessionId);
  assert.equal(compacted.compacted, 1);
  const current = await syncytium.snapshot(session.sessionId);
  assert.equal(current.shared.retainedOps, 0);
  assert.equal(current.shared.compactedOps, 1);
  assert.equal(current.shared.sharedFields.value, 1);
  assert.throws(() => session.crdt.timeTravelToStep(0), (error) => error.code === 'SYNCYTIUM_HISTORY_COMPACTED');

  const restored = createSyncytiumCrdt();
  restored.restore(session.crdt.serialize());
  assert.deepEqual(restored.getSnapshot().sharedFields, current.shared.sharedFields);
  assert.deepEqual(restored.getCausalFrontier(), current.shared.causalFrontier);
  assert.equal(restored.hasOpId(first.opId), true);
  assert.equal(restored.applyOp(first).totalOps, 1);

  const applied = await syncytium.applyTransaction(session.sessionId, {
    txId: 'version-after-compaction',
    preconditions: [{ op: 'state_version', value: 1 }],
    operations: [{ opId: 'snapshot-op-2', actorId: 'alpha', kind: { type: 'set_field', key: 'value', value: 2 } }]
  });
  assert.equal(applied.snapshot.sharedFields.value, 2);
}

async function verifyReplicaStability() {
  const session = await syncytium.createSession('Replica acknowledgements bound garbage collection.');
  await syncytium.applyOperation(session.sessionId, {
    opId: 'replica-op-1', actorId: 'writer', kind: { type: 'set_field', key: 'value', value: 'one' }
  });
  const joined = await syncytium.joinReplica(session.sessionId, { replicaId: 'replica-a', actorId: 'reader' });
  assert.equal(joined.snapshot.shared.sharedFields.value, 'one');
  await syncytium.applyOperation(session.sessionId, {
    opId: 'replica-op-2', actorId: 'writer', kind: { type: 'set_field', key: 'value', value: 'two' }
  });
  assert.equal((await syncytium.compactHistory(session.sessionId)).compacted, 1);
  const current = await syncytium.snapshot(session.sessionId);
  await syncytium.acknowledgeReplica(session.sessionId, 'replica-a', { frontier: current.shared.causalFrontier });
  assert.equal((await syncytium.compactHistory(session.sessionId)).compacted, 1);
  assert.equal((await syncytium.inspectReplicas(session.sessionId))[0].status, 'ACTIVE');
  await syncytium.leaveReplica(session.sessionId, 'replica-a');
  assert.equal((await syncytium.inspectReplicas(session.sessionId))[0].status, 'RETIRED');
  await assert.rejects(
    syncytium.acknowledgeReplica(session.sessionId, 'replica-a', { frontier: { writer: 99 } }),
    (error) => error.code === 'SYNCYTIUM_REPLICA_FRONTIER_INVALID'
  );
}

main().then(() => console.log('Syncytium snapshot and replica checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
