'use strict';

const assert = require('node:assert/strict');
const rhizome = require('../src/services/rhizomeCoordinationService');

async function run() {
  const session = await rhizome.composeRhizome('Determine whether three competing strategies are needed.');
  const proposal = await rhizome.proposeNestedTopology(session.sessionId, {
    missionId: session.missionId,
    needKind: 'hypothesis_competition',
    budget: 1200
  });
  assert.equal(proposal.targetTopology, 'trinity');
  assert.equal(proposal.candidateNode.kind, 'SUB_TOPOLOGY');
  assert.equal(proposal.candidateNode.state, 'DISCOVERED');
  assert.equal(proposal.plan.selectedTopology, 'trinity');
  const snapshot = await rhizome.graphSnapshot(session.sessionId);
  assert.ok(snapshot.nodes.some((node) => node.nodeId === proposal.candidateNode.nodeId));
  assert.equal((await rhizome.routeToCapability(session.sessionId, {
    needId: 'nested', capability: 'topology:trinity'
  })).verdict, 'unreachable');
}

run().then(() => console.log('Rhizome nested topology checks: PASS')).catch((error) => {
  console.error('Rhizome nested topology test failed:', error);
  process.exit(1);
});
