'use strict';

const assert = require('node:assert/strict');
const { createSyncytiumCrdt } = require('../src/services/syncytiumCrdtService');
const typed = require('../src/services/syncytiumCrdtTypeRegistry');
const syncytium = require('../src/services/syncytiumCoordinationService');
const { createSyncytiumTick } = require('../src/services/syncytium/runtime/syncytiumTick');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');

function write(opId, actorId, value) {
  return { opId, actorId, kind: { type: 'set_field', key: 'value', value } };
}

function causalReplayAndRecovery() {
  const first = { ...write('before', 'A', 'before'), timestampMs: 1000, lamport: 50,
    causalContext: {}, dot: { actorId: 'A', sequence: 1 } };
  const second = { ...write('after', 'B', 'after'), timestampMs: 1, lamport: 51,
    causalContext: { A: 1 }, dot: { actorId: 'B', sequence: 1 } };
  const snapshots = [[first, second], [second, first]].map((operations) => {
    const runtime = createSyncytiumCrdt();
    for (const operation of operations) runtime.applyOp(operation);
    assert.equal(runtime.getSnapshot().sharedFields.value, 'after');
    assert.equal(runtime.timeTravel(5).sharedFields.value, undefined);
    return runtime.getSnapshot();
  });
  assert.deepEqual(snapshots[0], snapshots[1]);
  const runtime = createSyncytiumCrdt();
  runtime.applyOp({ ...first, fieldType: 'LWW_REGISTER' });
  runtime.compact({ A: 1 });
  const restored = createSyncytiumCrdt();
  restored.restore(runtime.serialize());
  restored.applyOp({ ...write('resumed', 'A', 'resumed'), fieldType: 'LWW_REGISTER' });
  assert.equal(restored.getHistory()[0].lamport, 51);
  assert.equal(restored.getSnapshot().sharedFields.value, 'resumed');
}

function immutableIdentityAndHistory() {
  const runtime = createSyncytiumCrdt();
  const operation = write('identity', 'A', { nested: 1 });
  runtime.applyOp(operation);
  operation.kind.value.nested = 99;
  const history = runtime.getHistory();
  history[0].kind.value.nested = 88;
  assert.deepEqual(runtime.getSnapshot().sharedFields.value, { nested: 1 });
  assert.throws(() => runtime.applyOp(write('identity', 'A', { nested: 2 })),
    (error) => error.code === 'SYNCYTIUM_OPERATION_ID_CONFLICT');
  runtime.compact(runtime.getCausalFrontier());
  const restored = runtime.fork();
  assert.throws(() => restored.applyOp(write('identity', 'B', { nested: 1 })),
    (error) => error.code === 'SYNCYTIUM_OPERATION_ID_CONFLICT');
  assert.equal(restored.applyOp(write('identity', 'A', { nested: 1 })).totalOps, 1);
}

function causalRegistersAndSequence() {
  const runtime = createSyncytiumCrdt();
  const assign = ({ id, actor, value, context }) => ({ opId: id, actorId: actor, causalContext: context,
    fieldType: 'MV_REGISTER', kind: { type: 'typed_field', key: 'choices', action: 'assign', value } });
  runtime.applyOp(assign({ id: 'choice-a', actor: 'A', value: 'a', context: {} }));
  runtime.applyOp(assign({ id: 'choice-b', actor: 'B', value: 'b', context: {} }));
  assert.deepEqual(runtime.getSnapshot().sharedFields.choices.sort(), ['a', 'b']);
  runtime.applyOp(assign({ id: 'choice-c', actor: 'C', value: 'c', context: { A: 1, B: 1 } }));
  assert.deepEqual(runtime.getSnapshot().sharedFields.choices, ['c']);
  const fields = {};
  const metadata = { opId: 'delete', actorId: 'A', lamport: 1 };
  typed.apply(fields, { fieldType: 'SEQUENCE', kind: {
    key: 'text', action: 'delete', elementId: 'element'
  } }, metadata);
  typed.apply(fields, { fieldType: 'SEQUENCE', kind: {
    key: 'text', action: 'insert', elementId: 'element', value: 'removed'
  } }, { ...metadata, opId: 'insert' });
  assert.deepEqual(typed.materialize(fields).text, []);
}

async function replicaLifecycle() {
  const session = await syncytium.createSession('Keep replica ownership and offline acknowledgements honest.');
  await syncytium.joinReplica(session.sessionId, { replicaId: 'owned', actorId: 'A' });
  await assert.rejects(syncytium.joinReplica(session.sessionId, { replicaId: 'owned', actorId: 'B' }),
    (error) => error.code === 'SYNCYTIUM_REPLICA_ACTOR_MISMATCH');
  await syncytium.partitionReplica(session.sessionId, 'owned');
  await syncytium.applyOperation(session.sessionId, write('offline-life', 'A', 'pending'), { replicaId: 'owned' });
  await assert.rejects(syncytium.acknowledgeReplica(session.sessionId, 'owned', { frontier: {} }),
    (error) => error.code === 'SYNCYTIUM_REPLICA_PENDING_OPERATIONS');
  const first = await syncytium.reconcileReplica(session.sessionId, 'owned', { frontier: {} });
  assert.deepEqual(first.accepted, ['offline-life']);
  const second = await syncytium.reconcileReplica(session.sessionId, 'owned', {
    frontier: (await syncytium.snapshot(session.sessionId)).shared.causalFrontier,
    operations: session.crdt.getHistory()
  });
  assert.deepEqual(second.accepted, []);
  await syncytium.leaveReplica(session.sessionId, 'owned');
  await assert.rejects(syncytium.acknowledgeReplica(session.sessionId, 'owned', {
    frontier: (await syncytium.snapshot(session.sessionId)).shared.causalFrontier
  }), (error) => error.code === 'SYNCYTIUM_REPLICA_RETIRED');
}

async function admissionAndOfflineSafety() {
  const session = await syncytium.createSession('Offline authority and invariants.', {
    schema: { fields: {
      value: { dataType: 'LEGACY_LWW', consistencyZone: 'SERIALIZABLE', offlinePolicy: 'REJECT' },
      queued: { dataType: 'LEGACY_LWW', consistencyZone: 'CAUSAL', offlinePolicy: 'QUEUE_UNTIL_CONNECTED' },
      funds: { dataType: 'PN_COUNTER', consistencyZone: 'EVENTUAL', offlinePolicy: 'ALLOW_LOCAL_MUTATION' }
    }, invariants: [{ id: 'funds-positive', dependencies: ['funds'],
      predicate: { op: 'non_negative', path: 'funds' } }] }
  });
  await assert.rejects(syncytium.applyOperation(session.sessionId, {
    ...write('gap', 'A', 1), causalContext: { missing: 1 }
  }), (error) => error.code === 'SYNCYTIUM_CAUSAL_GAP');
  await assert.rejects(syncytium.applyOperation(session.sessionId, write('unknown', 'A', 1), {
    replicaId: 'unknown'
  }), (error) => error.code === 'SYNCYTIUM_REPLICA_UNKNOWN');
  await syncytium.applyOperation(session.sessionId, { opId: 'funds', actorId: 'A',
    kind: { type: 'typed_field', key: 'funds', action: 'increment', delta: 5 } });
  await syncytium.joinReplica(session.sessionId, { replicaId: 'offline', actorId: 'A' });
  await syncytium.partitionReplica(session.sessionId, 'offline');
  await assert.rejects(syncytium.applyOperation(session.sessionId, {
    ...write('bypass', 'A', 1), offlinePolicy: 'ALLOW_LOCAL_MUTATION'
  }, { replicaId: 'offline' }), (error) => error.code === 'SYNCYTIUM_OFFLINE_REJECTED');
  await assert.rejects(syncytium.applyOperation(session.sessionId, {
    opId: 'queue-bypass', actorId: 'A', offlinePolicy: 'ALLOW_LOCAL_MUTATION',
    kind: { type: 'set_field', key: 'queued', value: 'unsafe' }
  }, { replicaId: 'offline' }), (error) => error.code === 'SYNCYTIUM_OFFLINE_POLICY_INVALID');
  await assert.rejects(syncytium.applyOperation(session.sessionId, { opId: 'overspend', actorId: 'A',
    kind: { type: 'typed_field', key: 'funds', action: 'increment', delta: -10 }
  }, { replicaId: 'offline' }), (error) => error.code === 'SYNCYTIUM_INVARIANT_VIOLATION');
  assert.equal((await syncytium.inspectReplicas(session.sessionId))[0].offlineOperationCount, 0);
  assert.equal((await syncytium.snapshot(session.sessionId)).shared.sharedFields.funds, 5);
}

async function durableAtomicity() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    const session = await syncytium.createSession('Disk failures do not commit.', { db });
    const originalRun = db.run.bind(db);
    db.run = async (sql, ...args) => {
      if (sql.startsWith('UPDATE topology_sessions')) throw new Error('injected disk failure');
      return originalRun(sql, ...args);
    };
    await assert.rejects(syncytium.applyOperation(session.sessionId, write('failed', 'A', 'lost'), { db }),
      (error) => error.code === 'SYNCYTIUM_PERSISTENCE_FAILURE');
    assert.equal((await syncytium.snapshot(session.sessionId)).shared.totalOps, 0);
    await assert.rejects(syncytium.applyOperation(session.sessionId, { opId: 'flux', actorId: 'A',
      kind: { type: 'flux_K+', deltaFlux: 2 }
    }, { db }), (error) => error.code === 'SYNCYTIUM_PERSISTENCE_FAILURE');
    assert.equal((await syncytium.snapshot(session.sessionId)).cytoplasm.ions['K+'].fluxCount, 0);
    db.run = originalRun;
    assert.equal((await syncytium.snapshot(session.sessionId, { db })).shared.totalOps, 0);
    await verifyFluxIdentity(session.sessionId, db);
    await syncytium.applyOperation(session.sessionId, write('failed', 'A', 'retry'), { db });
    assert.equal((await syncytium.snapshot(session.sessionId, { db })).shared.sharedFields.value, 'retry');
    await syncytium.applyTransaction(session.sessionId, { txId: 'transaction',
      operations: [write('tx-op', 'B', 'tx')] }, { db });
    await assert.rejects(syncytium.applyTransaction(session.sessionId, { txId: 'transaction',
      operations: [write('tx-op', 'B', 'tampered')] }, { db }),
    (error) => error.code === 'SYNCYTIUM_OPERATION_ID_CONFLICT');
    assert.equal((await syncytium.snapshot(session.sessionId, { db })).shared.sharedFields.value, 'tx');
  } finally { await db.close(); }
}

async function verifyFluxIdentity(sessionId, db) {
  const operation = { opId: 'flux', actorId: 'A', kind: { type: 'flux_K+', deltaFlux: 2 } };
  await syncytium.applyOperation(sessionId, operation, { db });
  const retried = await syncytium.applyOperation(sessionId, operation, { db });
  assert.equal(retried.duplicate, true);
  await assert.rejects(syncytium.applyOperation(sessionId, { ...operation,
    kind: { type: 'flux_K+', deltaFlux: 3 } }, { db }), error => error.code === 'SYNCYTIUM_OPERATION_ID_CONFLICT');
  assert.equal((await syncytium.snapshot(sessionId, { db })).cytoplasm.ions['K+'].fluxCount, 1);
}

async function repairedRuntimeReceipt() {
  let version = 0;
  const options = { db: { marker: 'same-db' } };
  const tick = createSyncytiumTick({
    syncytium: { snapshot: async () => ({ shared: { totalOps: version } }) },
    stateController: { receive: async () => { version = 1; return { accepted: true }; } },
    repairController: {
      inspect: async () => ({ required: version === 1 }),
      repair: async (id, request) => { assert.equal(request.options.db, options.db); version = 2; return { repaired: true }; }
    },
    materializationController: {
      materialize: async () => ({ stored: { version }, stateVersion: version }),
      compact: async () => ({ compacted: true })
    }, options: { snapshotEvery: 2 }
  });
  const result = await tick.processEvent('session', { options, repairRequest: { invariantId: 'test' } });
  assert.equal(result.snapshot.shared.totalOps, 2);
  assert.equal(result.repair.required, false);
  assert.equal(result.materialization.stateVersion, 2);
}

async function main() {
  causalReplayAndRecovery();
  immutableIdentityAndHistory();
  causalRegistersAndSequence();
  await admissionAndOfflineSafety();
  await replicaLifecycle();
  await durableAtomicity();
  await repairedRuntimeReceipt();
  console.log('Syncytium completion regressions: PASS (7 groups)');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
