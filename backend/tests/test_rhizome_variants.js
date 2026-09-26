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

  const exploratoryPolicy = variants.resolve('exploratory');
  assert.equal(exploratoryPolicy.routing.curiosityWeight, 0.25);
  assert.equal(exploratoryPolicy.pruning.enabled, false);
  assert.equal(exploratoryPolicy.routing.maxHops, 6);

  const growthPolicy = variants.resolve('growth');
  assert.equal(growthPolicy.growth.threshold, 0);
  assert.equal(growthPolicy.growth.growthReserveRatio, 0.5);
  assert.equal(growthPolicy.pruning.enabled, false);

  const diamond = {
    nodes: [node('d-source', []), node('d-left', []), node('d-right', []), node('d-answer', ['deep_answer'])],
    edges: [
      { edgeId: 'd1', from: 'd-source', to: 'd-left', relation: 'ROUTES_TO', status: 'ACTIVE' },
      { edgeId: 'd2', from: 'd-left', to: 'd-answer', relation: 'ROUTES_TO', status: 'ACTIVE' },
      { edgeId: 'd3', from: 'd-source', to: 'd-right', relation: 'ROUTES_TO', status: 'ACTIVE' },
      { edgeId: 'd4', from: 'd-right', to: 'd-answer', relation: 'ROUTES_TO', status: 'ACTIVE' }
    ]
  };
  const resilient = await rhizome.composeRhizome('Tolerate route failures.', { ...diamond, variant: 'resilient' });
  const resilientPolicy = variants.resolve('resilient');
  assert.equal(resilientPolicy.resilience.alternatives, 4);
  assert.equal(resilientPolicy.routing.edgeDisjointAlternatives, true);
  const resilientRoute = await rhizome.routeToCapability(resilient.sessionId, { needId: 'deep', capability: 'deep_answer' });
  assert.equal(resilientRoute.selected, true);
  assert.ok(resilientRoute.alternatives.length >= 2);

  const smallWorld = await rhizome.composeRhizome('Prefer short paths.', { ...diamond, variant: 'small_world' });
  assert.equal(variants.resolve('small_world').routing.preferShortPaths, true);
  assert.deepEqual(await rhizome.planSmallWorldShortcuts(smallWorld.sessionId), []);

  const persistentLease = await rhizome.composeRhizome('Durable cross-mission network.', { ...diamond, variant: 'persistent' });
  const lease = await rhizome.manageBranchLease(persistentLease.sessionId,
    { action: 'acquire', leaseId: 'lease-1', branchId: 'branch-1', ownerId: 'owner-1', ttlMs: 60000 });
  assert.equal(lease.lease.leaseId, 'lease-1');
  assert.equal(lease.renewed, false);
  const released = await rhizome.manageBranchLease(persistentLease.sessionId,
    { action: 'release', leaseId: 'lease-1', branchId: 'branch-1', ownerId: 'owner-1' });
  assert.equal(released.released, true);

  const shortLived = await rhizome.composeRhizome('One-off disposable run.', { ...diamond, variant: 'ephemeral' });
  assert.equal(await rhizome.getSessionFossil(shortLived.sessionId), null);
  await rhizome.closeSession(shortLived.sessionId);
  assert.equal((await rhizome.getSessionFossil(shortLived.sessionId)).contract, 'RhizomeEphemeralFossil/v1');

  const proceduralPolicy = variants.resolve('procedural');
  assert.equal(proceduralPolicy.propagation.requireLocalEvidence, true);
  assert.equal(proceduralPolicy.propagation.requireCompatibilityTrials, true);
  assert.equal(proceduralPolicy.propagation.requireCausalValidation, true);

  const healingPolicy = variants.resolve('self_healing');
  assert.equal(healingPolicy.resilience.automaticRepair, true);
  assert.equal(healingPolicy.resilience.maxSelfRepairRounds, 5);
  assert.equal(healingPolicy.resilience.alternatives, 4);
}

run().then(() => console.log('Rhizome variant checks: PASS')).catch((error) => {
  console.error('Rhizome variant test failed:', error);
  process.exit(1);
});
