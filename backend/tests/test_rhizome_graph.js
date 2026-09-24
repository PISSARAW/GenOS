'use strict';

const assert = require('node:assert/strict');
const graph = require('../src/services/rhizome/graph/capabilityGraphService');

function session() {
  return { rhizomeId: 'r-1', missionId: 'm-1', graphVersion: 0, nodes: [], edges: [] };
}

function node(nodeId, capabilities = []) {
  return { nodeId, kind: 'AGENT', capabilities };
}

function edge(edgeId, from, to) {
  return { edgeId, from, to, relation: 'ROUTES_TO' };
}

function run() {
  const initial = session();
  const withOrigin = graph.addNode(initial, node('origin', ['search']));
  const withTarget = graph.addNode(withOrigin, node('target', ['verify']));
  const connected = graph.addEdge(withTarget, edge('bridge', 'origin', 'target'));
  const snapshot = graph.snapshot(connected);
  assert.equal(snapshot.contract, 'RhizomeGraphSnapshot/v1');
  assert.equal(snapshot.graphVersion, 3);
  assert.deepEqual(snapshot.nodes.map((item) => item.nodeId), ['origin', 'target']);
  assert.equal(snapshot.edges[0].to, 'target');
  assert.throws(() => graph.addEdge(connected, edge('orphan', 'origin', 'missing')), { code: 'RHIZOME_GRAPH_INVALID' });
  assert.throws(() => graph.addNode(connected, node('origin')), { code: 'RHIZOME_NODE_EXISTS' });
  assert.equal(initial.nodes.length, 0);
}

run();
console.log('Rhizome graph tests passed.');
