'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createHardSession('Fence concurrent critical mutations.', {
    authorityMembers: ['worker'],
    fields: { state: { dataType: 'MAP', consistencyZone: 'SERIALIZABLE', ownerDomain: 'workers' } },
    nuclearDomains: [{ domainId: 'workers', members: ['worker'], owns: ['state'] }]
  });
  const sessionId = session.sessionId;
  const lease = await syncytium.acquireHardFence(sessionId, { actorId: 'worker', resourceId: 'deployment', ttlMs: 60000 });
  const calls = Array.from({ length: 20 }, (_, index) => syncytium.runFencedTransaction(sessionId, {
    actorId: 'worker', resourceId: 'deployment', domainId: 'workers',
    leaseToken: lease.lease.leaseToken, fence: lease.lease.fence,
    txId: `critical-${index}`, operations: [{ opId: `critical-op-${index}`, actorId: 'worker', domainId: 'workers',
      kind: { type: 'typed_field', key: 'state', action: 'set', entryKey: `operation-${index}`, value: index } }]
  }));
  const results = await Promise.all(calls);
  assert.equal(results.length, 20);
  const state = await syncytium.snapshot(sessionId);
  assert.equal(Object.keys(state.shared.sharedFields.state).length, 20);

  await new Promise((resolve) => setTimeout(resolve, 10));
  const next = await syncytium.acquireHardFence(sessionId, { actorId: 'worker', resourceId: 'deployment', ttlMs: 60000 });
  assert.equal(next.lease.fence, 2);
  await assert.rejects(() => syncytium.runFencedTransaction(sessionId, {
    actorId: 'worker', resourceId: 'deployment', domainId: 'workers',
    leaseToken: lease.lease.leaseToken, fence: lease.lease.fence,
    operations: [{ opId: 'stale-op', actorId: 'worker', domainId: 'workers',
      kind: { type: 'typed_field', key: 'state', action: 'set', entryKey: 'stale', value: true } }]
  }), (error) => error.code === 'SYNCYTIUM_HARD_FENCE_STALE');
  console.log('Syncytium hard fencing and concurrent transaction checks: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
