'use strict';

const assert = require('node:assert/strict');
const rhizome = require('../src/services/rhizomeCoordinationService');

async function run() {
  const session = await rhizome.composeRhizome('Survive loss of a temporary coordination locus.', {
    nodes: [
      { nodeId: 'source', kind: 'AGENT', capabilities: ['search'], state: 'ACTIVE', reliability: 0.9 },
      { nodeId: 'target', kind: 'TOOL', capabilities: ['answer'], state: 'ACTIVE', reliability: 0.8 }
    ],
    edges: [{ edgeId: 'route', from: 'source', to: 'target', relation: 'ROUTES_TO' }]
  });
  const assigned = await rhizome.manageCoordinationLocus(session.sessionId, {
    action: 'assign', locus: { locusId: 'temporary', reason: 'mission coordination', authorityBounds: { decisions: ['routing'] } }
  });
  assert.equal(assigned.holderNodeId, 'source');
  assert.ok(Date.parse(assigned.leaseUntil) > Date.now());

  const transferred = await rhizome.manageCoordinationLocus(session.sessionId, {
    action: 'transfer', locus: { locusId: 'temporary', reason: 'holder unavailable' }
  });
  assert.equal(transferred.holderNodeId, 'target');

  await rhizome.manageCoordinationLocus(session.sessionId, { action: 'drop', locusId: 'temporary' });
  const route = await rhizome.routeToCapability(session.sessionId, { needId: 'answer', capability: 'answer' });
  assert.equal(route.selected, true);
  assert.deepEqual(route.route.nodeIds, ['source', 'target']);
  await rhizome.closeSession(session.sessionId);
}

run().then(() => console.log('Rhizome coordination locus tests passed.')).catch((error) => {
  console.error('Rhizome locus test failed:', error);
  process.exit(1);
});
