'use strict';

const assert = require('node:assert/strict');
const rhizome = require('../src/services/rhizomeCoordinationService');

function diamond() {
  return {
    nodes: [node('a', ['search']), node('b', ['translate']), node('c', ['translate']), node('d', ['answer'])],
    edges: [edge('ab', 'a', 'b'), edge('bd', 'b', 'd'), edge('ac', 'a', 'c'), edge('cd', 'c', 'd')],
    activeNeeds: []
  };
}

function node(nodeId, capabilities) {
  return { nodeId, kind: 'AGENT', capabilities, state: 'ACTIVE', reliability: 0.9, evidenceRequirements: [] };
}

function edge(edgeId, from, to) {
  return { edgeId, from, to, relation: 'ROUTES_TO', status: 'ACTIVE', compatibility: 0.9, conductivity: 0.8, reliability: 0.8, successRate: 0, evidenceQuality: 0, cost: 0, latency: 1, trailState: { positive: 0, negative: 0 } };
}

async function run() {
  const staleSession = await rhizome.composeRhizome('Reject stale pruning.', diamond());
  const stalePlan = await rhizome.inspectPruning(staleSession.sessionId, { now: Date.now() + 1000 });
  await rhizome.addCapabilityNode(staleSession.sessionId, node('new', ['audit']));
  await assert.rejects(() => rhizome.applyPruningPlan(staleSession.sessionId, stalePlan, { now: Date.now() + 1000 }), { code: 'RHIZOME_PRUNING_STALE' });
  assert.ok(staleSession.edges.every((item) => item.status === 'ACTIVE'));

  const session = await rhizome.composeRhizome('Commit safe pruning atomically.', diamond());
  const plan = await rhizome.inspectPruning(session.sessionId, { now: Date.now() + 1000 });
  const applied = await rhizome.applyPruningPlan(session.sessionId, plan, { now: Date.now() + 1000 });
  assert.equal(applied.graphVersion, plan.graphVersion + 1);
  assert.deepEqual(applied.retiredEdgeIds.sort(), ['ab', 'ac', 'bd', 'cd']);
  assert.ok(session.edges.every((item) => item.status === 'RETIRED'));

  const protectedSession = await rhizome.composeRhizome('Preserve required reachability after combined pruning.', diamond());
  await rhizome.registerNeed(protectedSession.sessionId, { needId: 'required', capability: 'answer', constraints: { risk: 1 } });
  const protectedPlan = await rhizome.inspectPruning(protectedSession.sessionId, { now: Date.now() + 1000 });
  await assert.rejects(() => rhizome.applyPruningPlan(protectedSession.sessionId, protectedPlan, { now: Date.now() + 1000 }), { code: 'RHIZOME_PRUNING_CONNECTIVITY_REQUIRED' });
  assert.ok(protectedSession.edges.every(item => item.status === 'ACTIVE'));
}

run().then(() => console.log('Rhizome transactional pruning: PASS')).catch((error) => {
  console.error('Rhizome pruning runtime failed:', error);
  process.exit(1);
});
