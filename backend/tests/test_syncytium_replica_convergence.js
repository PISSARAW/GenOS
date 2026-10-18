'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  await verifyReplicaConvergenceAfterReconciliation();
  await verifyLateReplicaObservesConvergedState();
}

async function verifyReplicaConvergenceAfterReconciliation() {
  const session = await syncytium.createSession('Replica convergence after reconciliation.', {
    schema: { fields: {
      draft: { dataType: 'LEGACY_LWW', consistencyZone: 'EVENTUAL', offlinePolicy: 'ALLOW_LOCAL_MUTATION' },
      server: { dataType: 'LEGACY_LWW', consistencyZone: 'EVENTUAL' }
    } }
  });

  await syncytium.applyOperation(session.sessionId, {
    opId: 'writer-base', actorId: 'writer', kind: { type: 'set_field', key: 'draft', value: 'base' }
  });

  const joined = await syncytium.joinReplica(session.sessionId, { replicaId: 'replica-a', actorId: 'reader' });
  assert.deepEqual(joined.snapshot.shared.sharedFields, { draft: 'base' });

  await syncytium.partitionReplica(session.sessionId, 'replica-a');

  const offline = await syncytium.applyOperation(session.sessionId, {
    opId: 'reader-offline', actorId: 'reader', kind: { type: 'set_field', key: 'draft', value: 'offline' }
  }, { replicaId: 'replica-a' });
  assert.equal(offline.offline, true);
  assert.equal(offline.snapshot.sharedFields.draft, 'offline');

  const online = await syncytium.applyOperation(session.sessionId, {
    opId: 'writer-online', actorId: 'writer', kind: { type: 'set_field', key: 'server', value: 'committed' }
  });
  assert.equal(online.snapshot.sharedFields.server, 'committed');

  const before = await syncytium.snapshot(session.sessionId);
  assert.equal(before.shared.sharedFields.draft, 'base');
  assert.equal(before.shared.sharedFields.server, 'committed');

  const reconciled = await syncytium.reconcileReplica(session.sessionId, 'replica-a', {
    frontier: joined.snapshot.causalFrontier
  });
  assert.equal(reconciled.status, 'REJOINING');
  assert.deepEqual(reconciled.accepted, ['reader-offline']);
  assert.equal(reconciled.missingOperations.some((operation) => operation.opId === 'writer-online'), true);

  const after = await syncytium.snapshot(session.sessionId);
  assert.equal(after.shared.sharedFields.draft, 'offline');
  assert.equal(after.shared.sharedFields.server, 'committed');

  await syncytium.acknowledgeReplica(session.sessionId, 'replica-a', {
    frontier: after.shared.causalFrontier
  });
  assert.equal((await syncytium.inspectReplicas(session.sessionId))[0].status, 'ACTIVE');
}

async function verifyLateReplicaObservesConvergedState() {
  const session = await syncytium.createSession('Late replica observes converged state.', {
    schema: { fields: {
      draft: { dataType: 'LEGACY_LWW', consistencyZone: 'EVENTUAL', offlinePolicy: 'ALLOW_LOCAL_MUTATION' },
      server: { dataType: 'LEGACY_LWW', consistencyZone: 'EVENTUAL' }
    } }
  });

  await syncytium.applyOperation(session.sessionId, {
    opId: 'writer-base', actorId: 'writer', kind: { type: 'set_field', key: 'draft', value: 'base' }
  });
  const joined = await syncytium.joinReplica(session.sessionId, { replicaId: 'replica-a', actorId: 'reader' });
  await syncytium.partitionReplica(session.sessionId, 'replica-a');
  await syncytium.applyOperation(session.sessionId, {
    opId: 'reader-offline', actorId: 'reader', kind: { type: 'set_field', key: 'draft', value: 'offline' }
  }, { replicaId: 'replica-a' });
  await syncytium.applyOperation(session.sessionId, {
    opId: 'writer-online', actorId: 'writer', kind: { type: 'set_field', key: 'server', value: 'committed' }
  });
  await syncytium.reconcileReplica(session.sessionId, 'replica-a', { frontier: joined.snapshot.causalFrontier });
  const after = await syncytium.snapshot(session.sessionId);
  await syncytium.acknowledgeReplica(session.sessionId, 'replica-a', { frontier: after.shared.causalFrontier });

  const late = await syncytium.joinReplica(session.sessionId, { replicaId: 'replica-b', actorId: 'observer' });
  assert.equal(late.snapshot.shared.sharedFields.draft, 'offline');
  assert.equal(late.snapshot.shared.sharedFields.server, 'committed');
}

main().then(() => console.log('Syncytium replica convergence checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
