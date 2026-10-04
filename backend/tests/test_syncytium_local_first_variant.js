'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createLocalFirstSession('Continue work offline and reconcile later.');
  const common = { sid: session.sessionId, dev: 'device-a', o: { actorId: 'user-a', offlineDurationMs: 60000 } };
  const staged = await syncytium.partitionOffline({ ...common, ops: [
    { payload: { field: 'notes', value: 'one' } },
    { payload: { field: 'notes', value: 'two' } },
    { payload: { field: 'notes', value: 'three' } }
  ] });
  assert.equal(staged.localOnly, true);
  assert.equal(staged.staged, 3);
  const before = await syncytium.snapshot(session.sessionId);
  assert.equal((before.shared.sharedFields.offlineQueue || []).length, 0);
  assert.equal((await syncytium.checkOfflineBudget({ sid: session.sessionId, dev: 'device-a', o: {} })).pendingOperations, 3);

  const reconciled = await syncytium.reconcileQueue({ sid: session.sessionId, dev: 'device-a', vc: {}, o: {} });
  assert.equal(reconciled.reconciled, 3);
  const after = await syncytium.snapshot(session.sessionId);
  assert.equal(after.shared.sharedFields.offlineQueue.length, 3);

  await assert.rejects(() => syncytium.partitionOffline({ sid: session.sessionId, dev: 'device-b',
    ops: [{ payload: { field: 'notes', value: 'late' } }], o: { actorId: 'user-b', offlineDurationMs: 7 * 86400000 + 1 } }),
  (error) => error.message.includes('7 days'));

  const expiring = await syncytium.partitionOffline({ sid: session.sessionId, dev: 'device-c',
    ops: [{ payload: { field: 'notes', value: 'expired' } }], o: { actorId: 'user-c', offlineDurationMs: 50 } });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const expiry = await syncytium.reconcileQueue({ sid: session.sessionId, dev: 'device-c', vc: {}, o: {} });
  assert.deepEqual(expiry.expired, expiring.operationIds);
  assert.equal(expiry.reconciled, 0);
  console.log('Syncytium local-first queue and reconciliation checks: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
