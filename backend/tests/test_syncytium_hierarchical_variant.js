'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createHierarchicalSession('Scale shared coordination by region.', {
    regions: [
      { regionId: 'region-a', members: ['agent-a1', 'agent-a2'], localFields: ['region-a.notes'] },
      { regionId: 'region-b', members: ['agent-b1', 'agent-b2'], localFields: ['region-b.notes'] }
    ],
    sharedContracts: [{ path: 'contract.release', dataType: 'LWW_REGISTER' }]
  });

  const local = await syncytium.applyRegionalOperation(session.sessionId, { regionId: 'region-a', operation: {
    opId: 'region-a-local', actorId: 'agent-a1', kind: { type: 'set_field', key: 'region-a.notes', value: 'private detail' }
  } });
  assert.deepEqual(local.deltaRecipients, ['region-a']);
  const boundary = await syncytium.applyRegionalOperation(session.sessionId, { regionId: 'region-a', operation: {
    opId: 'region-a-contract', actorId: 'agent-a1', kind: { type: 'typed_field', key: 'contract.release', action: 'assign', value: 'v3' }
  } });
  assert.deepEqual(boundary.deltaRecipients, ['organism', 'region-a', 'region-b']);

  const regionA = await syncytium.regionalSnapshot(session.sessionId, { regionId: 'region-a' });
  const regionB = await syncytium.regionalSnapshot(session.sessionId, { regionId: 'region-b' });
  assert.equal(regionA.shared.sharedFields['region-a.notes'], 'private detail');
  assert.equal(regionA.shared.sharedFields['region-b.notes'], undefined);
  assert.equal(regionB.shared.sharedFields['region-a.notes'], undefined);
  assert.equal(regionB.shared.sharedFields['contract.release'], 'v3');
  assert.deepEqual(regionB.hierarchy.boundaryPaths, ['contract.release']);
  assert.equal((await syncytium.regionalSnapshot(session.sessionId, { regionId: 'region-a' })).hierarchy.localPathCount, 1);

  await assert.rejects(() => syncytium.applyRegionalOperation(session.sessionId, { regionId: 'region-a', operation: {
    opId: 'wrong-region-write', actorId: 'agent-b1', kind: { type: 'set_field', key: 'region-a.notes', value: 'intrusion' }
  } }), (error) => error.code === 'SYNCYTIUM_AUTHORITY_VIOLATION');
  await assert.rejects(() => syncytium.regionalSnapshot(session.sessionId, { regionId: 'missing-region' }),
    (error) => error.code === 'SYNCYTIUM_HIERARCHY_INVALID');

  const firebreakSession = await syncytium.createHierarchicalSession('Isolate and reopen a damaged region.', {
    regions: [
      { regionId: 'region-a', members: ['agent-a'], localFields: ['region-a.private'] },
      { regionId: 'region-b', members: ['agent-b'], localFields: ['region-b.private'] },
      { regionId: 'region-c', members: ['agent-c'], localFields: ['region-c.private'] }
    ], sharedContracts: [{ path: 'global.status', dataType: 'LWW_REGISTER' }]
  });
  await syncytium.setRegionalFirebreak(firebreakSession.sessionId, {
    regionId: 'region-b', active: true, actorId: 'agent-a'
  });
  await assert.rejects(() => syncytium.applyRegionalOperation(firebreakSession.sessionId, { regionId: 'region-b', operation: {
    opId: 'blocked-b', actorId: 'agent-b', kind: { type: 'set_field', key: 'region-b.private', value: 'blocked' }
  } }), (error) => error.code === 'SYNCYTIUM_REGION_FIREBREAK_ACTIVE');
  await syncytium.applyRegionalOperation(firebreakSession.sessionId, { regionId: 'region-a', operation: {
    opId: 'global-v1', actorId: 'agent-a', kind: { type: 'typed_field', key: 'global.status', action: 'assign', value: 'v1' }
  } });
  await syncytium.reconcileRegionalBoundary(firebreakSession.sessionId, {
    regionId: 'region-b', actorId: 'agent-b', contractPaths: ['global.status']
  });
  await syncytium.applyRegionalOperation(firebreakSession.sessionId, { regionId: 'region-c', operation: {
    opId: 'global-v2', actorId: 'agent-c', kind: { type: 'typed_field', key: 'global.status', action: 'assign', value: 'v2' }
  } });
  await assert.rejects(() => syncytium.setRegionalFirebreak(firebreakSession.sessionId, {
    regionId: 'region-b', active: false, actorId: 'agent-a'
  }), (error) => error.code === 'SYNCYTIUM_BOUNDARY_RECONCILIATION_REQUIRED');
  await syncytium.reconcileRegionalBoundary(firebreakSession.sessionId, {
    regionId: 'region-b', actorId: 'agent-b', contractPaths: ['global.status']
  });
  await syncytium.setRegionalFirebreak(firebreakSession.sessionId, {
    regionId: 'region-b', active: false, actorId: 'agent-a'
  });
  const reopened = await syncytium.applyRegionalOperation(firebreakSession.sessionId, { regionId: 'region-b', operation: {
    opId: 'reopened-b', actorId: 'agent-b', kind: { type: 'set_field', key: 'region-b.private', value: 'private' }
  } });
  assert.deepEqual(reopened.deltaRecipients, ['region-b']);
  const regionAAfter = await syncytium.regionalSnapshot(firebreakSession.sessionId, { regionId: 'region-a' });
  assert.equal(regionAAfter.shared.sharedFields['region-b.private'], undefined);
}

main().then(() => console.log('Syncytium hierarchical variant checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
