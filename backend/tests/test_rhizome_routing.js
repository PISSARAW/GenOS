'use strict';

const assert = require('node:assert/strict');
const planner = require('../src/services/rhizome/routing/routePlanner');

function node(nodeId, capabilities = [], overrides = {}) {
  return { nodeId, kind: 'AGENT', capabilities, state: 'ACTIVE', reliability: 0.9, evidenceRequirements: [], ...overrides };
}

function edge(edgeId, connection, overrides = {}) {
  return { edgeId, ...connection, relation: 'ROUTES_TO', status: 'ACTIVE', compatibility: 0.9, conductivity: 1, reliability: 0.95, successRate: 0.8, evidenceQuality: 0.8, cost: 0, latency: 10, trailState: { positive: 0, negative: 0 }, ...overrides };
}

function need(overrides = {}) {
  return { needId: 'n1', capability: 'verify', constraints: { risk: 1 }, ...overrides };
}

function run() {
  const graph = {
    nodes: [node('source', ['search']), node('middle', ['translate']), node('target', ['verify'])],
    edges: [edge('first', { from: 'source', to: 'middle' }), edge('second', { from: 'middle', to: 'target' })],
    coordinationLoci: [{ holderNodeId: 'source' }]
  };
  const multiHop = planner.plan(graph, need());
  assert.equal(multiHop.selected, true);
  assert.equal(multiHop.verdict, 'route_selected');
  assert.deepEqual(multiHop.route.nodeIds, ['source', 'middle', 'target']);
  assert.deepEqual(multiHop.route.edgeIds, ['first', 'second']);

  assert.equal(planner.plan(graph, need({ capability: 'missing' })).verdict, 'unreachable');
  assert.equal(planner.plan(graph, need({ constraints: { cost: 0, risk: 1 } })).verdict, 'unreachable');

  const direct = { nodes: [node('direct', ['verify'])], edges: [], coordinationLoci: [] };
  assert.deepEqual(planner.plan(direct, need()).route.nodeIds, ['direct']);
}

run();
console.log('Rhizome routing tests passed.');
