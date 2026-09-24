'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  await verifyConflictLeavesReplicaPartitioned();
  const session = await syncytium.createSession('Reconcile offline mutations by causal frontier.', {
    schema: { fields: {
      draft: { dataType: 'LEGACY_LWW', consistencyZone: 'EVENTUAL', offlinePolicy: 'ALLOW_LOCAL_MUTATION' },
      queued: { dataType: 'LEGACY_LWW', consistencyZone: 'CAUSAL', offlinePolicy: 'QUEUE_UNTIL_CONNECTED' },
      deployment: { dataType: 'LEGACY_LWW', consistencyZone: 'SERIALIZABLE', offlinePolicy: 'REJECT' },
      server: { dataType: 'LEGACY_LWW', consistencyZone: 'EVENTUAL' }
    } }
  });
  await syncytium.applyOperation(session.sessionId, {
    opId: 'partition-base', actorId: 'writer', kind: { type: 'set_field', key: 'draft', value: 'base' }
  });
  const joined = await syncytium.joinReplica(session.sessionId, { replicaId: 'offline-a', actorId: 'offline-writer' });
  await syncytium.partitionReplica(session.sessionId, 'offline-a');

  const local = await syncytium.applyOperation(session.sessionId, {
    opId: 'offline-draft', actorId: 'offline-writer', kind: { type: 'set_field', key: 'draft', value: 'local' }
  }, { replicaId: 'offline-a' });
  assert.equal(local.offline, true);
  assert.equal(local.queued, false);
  assert.equal(local.snapshot.sharedFields.draft, 'local');

  const queued = await syncytium.applyOperation(session.sessionId, {
    opId: 'offline-queued', actorId: 'offline-writer', kind: { type: 'set_field', key: 'queued', value: 'later' }
  }, { replicaId: 'offline-a' });
  assert.equal(queued.queued, true);
  assert.equal(queued.snapshot.sharedFields.queued, undefined);

  await assert.rejects(syncytium.applyOperation(session.sessionId, {
    opId: 'offline-deployment', actorId: 'offline-writer', kind: { type: 'set_field', key: 'deployment', value: 'go' }
  }, { replicaId: 'offline-a' }), (error) => error.code === 'SYNCYTIUM_OFFLINE_REJECTED');

  const server = await syncytium.applyOperation(session.sessionId, {
    opId: 'server-during-partition', actorId: 'writer', kind: { type: 'set_field', key: 'server', value: 'committed' }
  });
  const reconciled = await syncytium.reconcileReplica(session.sessionId, 'offline-a', {
    frontier: joined.snapshot.causalFrontier
  });
  assert.equal(reconciled.status, 'REJOINING');
  assert.equal(reconciled.accepted.length, 2);
  assert.equal(reconciled.missingOperations.some((operation) => operation.opId === 'server-during-partition'), true);
  await syncytium.acknowledgeReplica(session.sessionId, 'offline-a', {
    frontier: (await syncytium.snapshot(session.sessionId)).shared.causalFrontier
  });
  assert.equal((await syncytium.inspectReplicas(session.sessionId))[0].status, 'ACTIVE');
  assert.equal((await syncytium.snapshot(session.sessionId)).shared.sharedFields.draft, 'local');
  assert.equal(server.snapshot.sharedFields.server, 'committed');
}

async function verifyConflictLeavesReplicaPartitioned() {
  const session = await syncytium.createSession('Reject concurrent offline writes to the same field.', {
    schema: { fields: { draft: { dataType: 'LEGACY_LWW', consistencyZone: 'EVENTUAL', offlinePolicy: 'ALLOW_LOCAL_MUTATION' } } }
  });
  await syncytium.applyOperation(session.sessionId, {
    opId: 'conflict-base', actorId: 'writer', kind: { type: 'set_field', key: 'draft', value: 'base' }
  });
  await syncytium.joinReplica(session.sessionId, { replicaId: 'conflict-replica', actorId: 'offline-writer' });
  await syncytium.partitionReplica(session.sessionId, 'conflict-replica');
  await syncytium.applyOperation(session.sessionId, {
    opId: 'offline-conflict', actorId: 'offline-writer', kind: { type: 'set_field', key: 'draft', value: 'offline' }
  }, { replicaId: 'conflict-replica' });
  await syncytium.applyOperation(session.sessionId, {
    opId: 'server-conflict', actorId: 'writer', kind: { type: 'set_field', key: 'draft', value: 'server' }
  });
  await assert.rejects(syncytium.reconcileReplica(session.sessionId, 'conflict-replica', {
    frontier: { writer: 1 }
  }), (error) => error.code === 'SYNCYTIUM_SEMANTIC_CONFLICT');
  assert.equal((await syncytium.inspectReplicas(session.sessionId))[0].status, 'PARTITIONED');
  assert.equal((await syncytium.snapshot(session.sessionId)).shared.sharedFields.draft, 'server');
}

main().then(() => console.log('Syncytium partition and reconciliation checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
