'use strict';

const assert = require('node:assert/strict');
const pruning = require('../src/services/rhizome/pruning/pruningService');

function node(nodeId, capabilities) {
  return { nodeId, kind: 'AGENT', capabilities, state: 'ACTIVE', reliability: 0.9, availability: { status: 'AVAILABLE' }, evidenceRequirements: [], cost: 0, latency: 0, provenance: [] };
}

function edge(edgeId, from, to) {
  return { edgeId, from, to, relation: 'ROUTES_TO', status: 'ACTIVE', successRate: 0, evidenceQuality: 0, cost: 0, lastUsed: null, trailState: { positive: 0, negative: 0, verifiedFlow: 0 } };
}

function run() {
  const chain = {
    graphVersion: 2, nodes: [node('a', ['search']), node('b', ['translate']), node('c', ['answer'])],
    edges: [edge('ab', 'a', 'b'), edge('bc', 'b', 'c')], activeNeeds: [{ needId: 'n', capability: 'answer', constraints: { risk: 1 } }],
    coordinationLoci: [{ holderNodeId: 'a' }]
  };
  const protectedPlan = pruning.inspect(chain, { now: Date.now() + 1000 });
  assert.ok(protectedPlan.edgeDispositions.every((item) => item.action === 'FOSSILIZE'));
  assert.ok(protectedPlan.edgeDispositions[0].fossil.fossilId);

  const diamond = {
    graphVersion: 3,
    nodes: [node('a', ['search']), node('b', ['translate']), node('c', ['translate']), node('d', ['answer'])],
    edges: [edge('ab', 'a', 'b'), edge('bd', 'b', 'd'), edge('ac', 'a', 'c'), edge('cd', 'c', 'd')],
    activeNeeds: [{ needId: 'n', capability: 'answer', constraints: { risk: 1 } }],
    coordinationLoci: [{ holderNodeId: 'a' }]
  };
  const plan = pruning.inspect(diamond, { now: Date.now() + 1000 });
  assert.ok(plan.edgeDispositions.every((item) => item.action === 'PRUNE'));
  assert.equal(diamond.edges.length, 4);

  const dormantNode = { ...node('dormant', ['answer']), state: 'DORMANT' };
  const nodePlan = pruning.inspect({ nodes: [node('a', []), dormantNode], edges: [], activeNeeds: [{ capability: 'answer' }], graphVersion: 1 });
  assert.equal(nodePlan.nodeDispositions[0].action, 'FOSSILIZE');
}

run();
console.log('Rhizome pruning policy tests passed.');
