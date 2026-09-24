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

async function run() {
  assert.deepEqual(variants.list(), ['exploratory', 'routing', 'growth', 'resilient', 'sparse']);
  assert.equal(variants.analyzeFit({ routeFailures: 1 }).variant, 'resilient');
  assert.equal(variants.analyzeFit({ budgetTight: true }).variant, 'sparse');
  assert.throws(() => variants.resolve('unknown'), (error) => error.code === 'RHIZOME_VARIANT_UNKNOWN');

  const sparse = await rhizome.composeRhizome('Respect the sparse route budget.', { ...chain(), variant: 'sparse' });
  const routing = await rhizome.composeRhizome('Allow long route exploration.', { ...chain(), variant: 'routing' });
  const need = { needId: 'proof', capability: 'formal_proof' };
  assert.equal((await rhizome.routeToCapability(sparse.sessionId, need)).verdict, 'unreachable');
  assert.equal((await rhizome.routeToCapability(routing.sessionId, need)).verdict, 'route_selected');
  assert.equal(sparse.variant, 'sparse');
}

run().then(() => console.log('Rhizome variant checks: PASS')).catch((error) => {
  console.error('Rhizome variant test failed:', error);
  process.exit(1);
});
