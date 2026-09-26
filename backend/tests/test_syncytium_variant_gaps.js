'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');
const { detectReservationDeadlock } = require('../src/services/syncytium/variants/transactional/transactionalVariantService');

async function transactionalGaps() {
  const session = await syncytium.createTransactionalSession('Idempotent leased reservations.', {
    resources: { budget: { planner: 20 } }
  });
  const first = await syncytium.reserveResources(session.sessionId, {
    txId: 'idem-1', reservationId: 'r-1', actorId: 'planner', budget: 5, idempotencyKey: 'key-1'
  });
  assert.equal(first.replayed, false);
  const second = await syncytium.reserveResources(session.sessionId, {
    txId: 'idem-2', reservationId: 'r-2', actorId: 'planner', budget: 5, idempotencyKey: 'key-1'
  });
  assert.equal(second.replayed, true);
  assert.equal(second.reservation.reservationId, 'r-1');
  assert.equal((await syncytium.transactionalSnapshot(session.sessionId)).resources.budget, 15);

  await syncytium.reserveResources(session.sessionId, {
    txId: 'lease-1', reservationId: 'r-lease', actorId: 'planner', budget: 3, ttlMs: 50
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
  const swept = await syncytium.sweepExpiredReservations(session.sessionId, {});
  assert.ok(swept.swept.includes('r-lease'));
  assert.equal((await syncytium.transactionalSnapshot(session.sessionId)).resources.budget, 15);

  const cycle = detectReservationDeadlock([
    { waiter: 'a', holder: 'b' }, { waiter: 'b', holder: 'c' }, { waiter: 'c', holder: 'a' }
  ]);
  assert.equal(cycle.deadlocked, true);
  assert.deepEqual(cycle.cycle, ['a', 'b', 'c', 'a']);
  assert.equal(cycle.victim, 'a');
  const clean = detectReservationDeadlock([
    { waiter: 'a', holder: 'b' }, { waiter: 'b', holder: 'c' }
  ]);
  assert.equal(clean.deadlocked, false);
  const selfLoop = detectReservationDeadlock([{ waiter: 'a', holder: 'a' }]);
  assert.equal(selfLoop.deadlocked, true);
}

async function codeGaps() {
  const session = await syncytium.createCodeSession('Dependency-aware locks and merge gates.');
  await syncytium.applyCodeChange(session.sessionId, {
    opId: 'gap-math-1', actorId: 'alice', filePath: 'src/math.js',
    content: 'export function add(a, b) { return a + b; }'
  });
  await syncytium.applyCodeChange(session.sessionId, {
    opId: 'gap-use-1', actorId: 'alice', filePath: 'src/use.js',
    content: "import { add } from './math.js';"
  });
  const lock = await syncytium.acquireFileLock(session.sessionId, {
    opId: 'gap-lock-1', actorId: 'alice', filePath: 'src/use.js'
  });
  assert.ok(lock.locked.includes('src/use.js'));
  assert.ok(lock.locked.includes('src/math.js'));
  await assert.rejects(syncytium.applyCodeChange(session.sessionId, {
    opId: 'gap-math-2', actorId: 'bob', filePath: 'src/math.js',
    content: 'export function add(a, b) { return a + b; }'
  }), (error) => error.code === 'SYNCYTIUM_CODE_LOCK_CONFLICT');
  await assert.rejects(syncytium.acquireFileLock(session.sessionId, {
    opId: 'gap-lock-2', actorId: 'bob', filePath: 'src/math.js'
  }), (error) => error.code === 'SYNCYTIUM_CODE_LOCK_CONFLICT');

  const closed = await syncytium.verifyMergeGate(session.sessionId, {});
  assert.equal(closed.mergeable, false);
  assert.ok(closed.reasons.includes('BUILD_NOT_PASSING'));
  assert.ok(closed.reasons.includes('NO_PASSING_TESTS'));

  await syncytium.releaseFileLock(session.sessionId, {
    opId: 'gap-unlock-1', actorId: 'alice', filePath: 'src/use.js', lockToken: lock.lockToken
  });
  await syncytium.applyCodeChange(session.sessionId, {
    opId: 'gap-math-3', actorId: 'bob', filePath: 'src/math.js',
    content: 'export function add(a, b) { return a + b; }'
  });
  await syncytium.recordCodeTestResult(session.sessionId, {
    opId: 'gap-test-1', actorId: 'ci', testId: 'unit', status: 'passed'
  });
  await syncytium.recordCodeBuildState(session.sessionId, {
    opId: 'gap-build-1', actorId: 'ci', status: 'passed', revision: 'r1'
  });
  const open = await syncytium.verifyMergeGate(session.sessionId, {});
  assert.equal(open.mergeable, true);
  assert.equal(open.passingTests, 1);
}

async function hardGaps() {
  const session = await syncytium.createHardSession('Ordered fenced transactions with recovery.', {
    authorityMembers: ['alice', 'bob'],
    fields: { probes: { dataType: 'MAP', consistencyZone: 'SERIALIZABLE', ownerDomain: 'hard-authority' } }
  });
  const fence = await syncytium.acquireHardFence(session.sessionId, {
    opId: 'gap-fence-1', actorId: 'alice', resourceId: 'db', ttlMs: 60000
  });
  const lease = fence.lease;
  const makeOps = (suffix) => (suffix === 'x' ? [
    { opId: `w-b-${suffix}`, actorId: 'alice', kind: { type: 'typed_field', key: 'probes', action: 'set', entryKey: 'b', value: { probe: 2 } } },
    { opId: `w-a-${suffix}`, actorId: 'alice', kind: { type: 'typed_field', key: 'probes', action: 'set', entryKey: 'a', value: { probe: 1 } } }
  ] : [
    { opId: `w-a-${suffix}`, actorId: 'alice', kind: { type: 'typed_field', key: 'probes', action: 'set', entryKey: 'a', value: { probe: 1 } } },
    { opId: `w-b-${suffix}`, actorId: 'alice', kind: { type: 'typed_field', key: 'probes', action: 'set', entryKey: 'b', value: { probe: 2 } } }
  ]);
  const fenceArgs = { actorId: 'alice', resourceId: 'db', leaseToken: lease.leaseToken, fence: lease.fence };
  const first = await syncytium.runFencedTransaction(session.sessionId, { ...fenceArgs, txId: 'gap-tx-1', operations: makeOps('x') });
  const second = await syncytium.runFencedTransaction(session.sessionId, { ...fenceArgs, txId: 'gap-tx-2', operations: makeOps('y') });
  assert.ok(first.deterministicOrder);
  assert.equal(first.deterministicOrder, second.deterministicOrder);

  await syncytium.acquireHardFence(session.sessionId, {
    opId: 'gap-fence-2', actorId: 'alice', resourceId: 'ephemeral', ttlMs: 50
  });
  await new Promise((resolve) => setTimeout(resolve, 80));
  const recovered = await syncytium.recoverExpiredFence(session.sessionId, {
    opId: 'gap-recover-1', actorId: 'bob', resourceId: 'ephemeral'
  });
  assert.ok(recovered);
  await assert.rejects(syncytium.recoverExpiredFence(session.sessionId, {
    opId: 'gap-recover-2', actorId: 'alice', resourceId: 'db'
  }), (error) => error.code === 'SYNCYTIUM_HARD_FENCE_ACTIVE');
  await assert.rejects(syncytium.recoverExpiredFence(session.sessionId, {
    opId: 'gap-recover-3', actorId: 'mallory', resourceId: 'ephemeral'
  }), (error) => error.code === 'SYNCYTIUM_HARD_AUTHORITY_REQUIRED');
}

async function run() {
  await transactionalGaps();
  await codeGaps();
  await hardGaps();
  console.log('Syncytium variant gaps: PASS');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
