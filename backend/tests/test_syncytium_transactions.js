'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  await verifyAtomicCommitAndRollback();
  await verifyEscrowAllocation();
}

async function verifyAtomicCommitAndRollback() {
  const session = await syncytium.createSession('Atomic budget and metadata update.', {
    schema: {
      fields: [
        { path: 'metadata.release', dataType: 'LWW_REGISTER' },
        { path: 'budget', dataType: 'PN_COUNTER', consistencyZone: 'INVARIANT_PRESERVING' }
      ],
      invariants: [{ id: 'budget-safe', dependencies: ['budget'], predicate: { op: 'non_negative', path: 'budget' } }]
    }
  });
  await syncytium.applyOperation(session.sessionId, {
    opId: 'budget-seed', actorId: 'finance', kind: { type: 'typed_field', key: 'budget', action: 'increment', delta: 3 }
  });

  const invalid = transaction('atomic-invalid', [
    { opId: 'release-invalid', actorId: 'release', kind: { type: 'set_field', key: 'metadata.release', value: 'v2' } },
    { opId: 'overspend-invalid', actorId: 'finance', kind: { type: 'typed_field', key: 'budget', action: 'increment', delta: -5 } }
  ]);
  await assert.rejects(() => syncytium.applyTransaction(session.sessionId, invalid),
    (error) => error.code === 'SYNCYTIUM_INVARIANT_VIOLATION');
  let snapshot = await syncytium.snapshot(session.sessionId);
  assert.equal(snapshot.shared.logSize, 1);
  assert.equal(snapshot.shared.sharedFields['metadata.release'], undefined);
  assert.equal(snapshot.shared.sharedFields.budget, 3);

  const valid = transaction('atomic-valid', [
    { opId: 'release-valid', actorId: 'release', kind: { type: 'set_field', key: 'metadata.release', value: 'v2' } },
    { opId: 'budget-valid', actorId: 'finance', kind: { type: 'typed_field', key: 'budget', action: 'increment', delta: -2 } }
  ]);
  valid.preconditions = [
    { op: 'state_version', value: 1 },
    { op: 'equals', path: 'budget', value: 3 }
  ];
  const committed = await syncytium.applyTransaction(session.sessionId, valid);
  assert.equal(committed.snapshot.sharedFields['metadata.release'], 'v2');
  assert.equal(committed.snapshot.sharedFields.budget, 1);
  assert.equal(committed.snapshot.logSize, 3);
  assert.equal((await syncytium.applyTransaction(session.sessionId, valid)).duplicate, true);

  await assert.rejects(() => syncytium.applyTransaction(session.sessionId, transaction('stale-tx', [
    { opId: 'stale-write', actorId: 'release', kind: { type: 'set_field', key: 'metadata.release', value: 'v3' } }
  ], [{ op: 'equals', path: 'budget', value: 3 }])), (error) => error.code === 'SYNCYTIUM_PRECONDITION_FAILED');
}

async function verifyEscrowAllocation() {
  const session = await syncytium.createSession('Partitioned budget allocation.', {
    schema: { fields: [{
      path: 'budget', dataType: 'ESCROW_COUNTER', consistencyZone: 'EVENTUAL',
      escrowAllocations: { alice: 5, bob: 0 }
    }] }
  });
  const consumed = await syncytium.applyOperation(session.sessionId, {
    opId: 'escrow-consume-a', actorId: 'alice',
    kind: { type: 'typed_field', key: 'budget', action: 'consume', amount: 3 }
  });
  assert.equal(consumed.snapshot.sharedFields.budget, 2);
  await assert.rejects(() => syncytium.applyOperation(session.sessionId, {
    opId: 'escrow-consume-bad', actorId: 'bob',
    kind: { type: 'typed_field', key: 'budget', action: 'consume', amount: 1 }
  }), (error) => error.code === 'SYNCYTIUM_CRDT_OPERATION_INVALID');
  assert.equal((await syncytium.snapshot(session.sessionId)).shared.logSize, 1);

  const allocation = transaction('escrow-transfer-tx', [{
    opId: 'escrow-transfer', actorId: 'treasury',
    kind: { type: 'typed_field', key: 'budget', action: 'allocate', fromActorId: 'alice', toActorId: 'bob', amount: 2 }
  }]);
  const transfer = await syncytium.applyTransaction(session.sessionId, allocation);
  assert.equal(transfer.coordination.classification, 'RED');
  const bobSpend = await syncytium.applyOperation(session.sessionId, {
    opId: 'escrow-consume-b', actorId: 'bob',
    kind: { type: 'typed_field', key: 'budget', action: 'consume', amount: 2 }
  });
  assert.equal(bobSpend.snapshot.sharedFields.budget, 0);
  await assert.rejects(() => syncytium.applyOperation(session.sessionId, {
    opId: 'escrow-alloc-direct', actorId: 'treasury',
    kind: { type: 'typed_field', key: 'budget', action: 'allocate', fromActorId: 'alice', toActorId: 'bob', amount: 1 }
  }), (error) => error.code === 'SYNCYTIUM_TRANSACTION_REQUIRED');
}

function transaction(txId, operations, preconditions = []) {
  return { txId, operations, preconditions, commitPolicy: 'SERIALIZABLE' };
}

main().then(() => console.log('Syncytium transaction checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
