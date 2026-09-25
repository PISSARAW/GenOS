'use strict';

const assert = require('node:assert/strict');
const rhizome = require('../src/services/rhizomeCoordinationService');
const variants = require('../src/services/rhizome/variants/variantPolicyService');

function chain() {
  const nodes = Array.from({ length: 8 }, (_, index) => ({
    nodeId: `n${index}`, kind: 'AGENT', capabilities: index === 7 ? ['formal_proof'] : [], state: 'ACTIVE'
  }));
  const edges = Array.from({ length: 7 }, (_, index) => ({
    edgeId: `e${index}`, from: `n${index}`, to: `n${index + 1}`, relation: 'ROUTES_TO', status: 'ACTIVE'
  }));
  return { nodes, edges, coordinationLoci: [{ locusId: 'root', holderNodeId: 'n0', reason: 'variant test' }] };
}

function node(nodeId, capabilities) {
  return { nodeId, kind: 'AGENT', capabilities, state: 'ACTIVE', reliability: 0.9, evidenceRequirements: [] };
}

async function run() {
  assert.deepEqual(variants.list(), ['exploratory', 'routing', 'growth', 'resilient', 'sparse', 'persistent', 'ephemeral', 'small_world', 'private', 'cross_representation', 'procedural', 'self_healing']);
  assert.equal(variants.analyzeFit({ routeFailures: 1 }).variant, 'resilient');
  assert.equal(variants.analyzeFit({ budgetTight: true }).variant, 'sparse');
  assert.throws(() => variants.resolve('unknown'), (error) => error.code === 'RHIZOME_VARIANT_UNKNOWN');
  assert.equal(variants.resolve('persistent').session.scope, 'persistent');
  assert.equal(variants.resolve('ephemeral').session.persistence, false);
  assert.equal(variants.resolve('small_world').routing.maxHops, 3);
  assert.equal(variants.resolve('procedural').propagation.requireLocalEvidence, true);
  assert.equal(variants.resolve('self_healing').resilience.automaticRepair, true);

  const sparse = await rhizome.composeRhizome('Respect the sparse route budget.', { ...chain(), variant: 'sparse' });
  const routing = await rhizome.composeRhizome('Allow long route exploration.', { ...chain(), variant: 'routing' });
  const need = { needId: 'proof', capability: 'formal_proof' };
  assert.equal((await rhizome.routeToCapability(sparse.sessionId, need)).verdict, 'unreachable');
  assert.equal((await rhizome.routeToCapability(routing.sessionId, need)).verdict, 'route_selected');
  assert.equal(sparse.variant, 'sparse');

  const persistent = await rhizome.composeRhizome('Use persistent session scope.', { variant: 'persistent' });
  const ephemeral = await rhizome.composeRhizome('Keep this session ephemeral.', { variant: 'ephemeral' });
  assert.equal(persistent.scope, 'persistent');
  assert.equal(ephemeral.scope, 'mission');

  const privateSession = await rhizome.composeRhizome('Route only through private nodes.', {
    variant: 'private', nodes: [{ ...node('private-answer', ['answer']), localContext: { confidentiality: 'PRIVATE' } }]
  });
  assert.equal((await rhizome.routeToCapability(privateSession.sessionId, { needId: 'private', capability: 'answer' })).selected, true);
  const publicSession = await rhizome.composeRhizome('Exclude public nodes.', {
    variant: 'private', nodes: [node('public-answer', ['answer'])]
  });
  assert.equal((await rhizome.routeToCapability(publicSession.sessionId, { needId: 'public', capability: 'answer' })).selected, false);

  const bridged = await rhizome.composeRhizome('Require a cross-representation bridge.', {
    variant: 'cross_representation',
    nodes: [node('source', []), { ...node('bridge', []), kind: 'PROCEDURE', localContext: { bridgeId: 'b1' } }, node('answer', ['formal_proof'])],
    edges: [
      { edgeId: 'in', from: 'source', to: 'bridge', relation: 'PROVIDES_INPUT' },
      { edgeId: 'out', from: 'bridge', to: 'answer', relation: 'TRANSLATES_TO' }
    ]
  });
  assert.equal((await rhizome.routeToCapability(bridged.sessionId, { needId: 'bridge', capability: 'formal_proof' })).selected, true);
}

run().then(() => console.log('Rhizome variant checks: PASS')).catch((error) => {
  console.error('Rhizome variant test failed:', error);
  process.exit(1);
});
