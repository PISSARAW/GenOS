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
}

main().then(() => console.log('Syncytium hierarchical variant checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
