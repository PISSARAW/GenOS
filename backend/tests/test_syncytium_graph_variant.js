'use strict';

const assert = require('node:assert/strict');
const syncytium = require('../src/services/syncytiumCoordinationService');

async function main() {
  const session = await syncytium.createGraphSession('Maintain a shared dependency graph.');
  await syncytium.addGraphNode(session.sessionId, {
    opId: 'graph-node-a', actorId: 'architect', id: 'A', value: { label: 'A', owner: 'core' }
  });
  await syncytium.addGraphNode(session.sessionId, {
    opId: 'graph-node-b', actorId: 'architect', id: 'B', value: { label: 'B' }
  });
  await assert.rejects(syncytium.addGraphEdge(session.sessionId, {
    opId: 'graph-dangling', actorId: 'architect', id: 'ab', value: { source: 'A', target: 'C' }
  }), (error) => error.conflicts.some((conflict) => conflict.type === 'GRAPH_DANGLING_EDGE'));

  await syncytium.addGraphEdge(session.sessionId, {
    opId: 'graph-edge-ab', actorId: 'architect', id: 'ab', value: { source: 'A', target: 'B', relation: 'depends_on' }, acyclic: true
  });
  await assert.rejects(syncytium.addGraphEdge(session.sessionId, {
    opId: 'graph-edge-ba', actorId: 'architect', id: 'ba', value: { source: 'B', target: 'A' }, acyclic: true
  }), (error) => error.conflicts.some((conflict) => conflict.type === 'GRAPH_CYCLE'));
  await assert.rejects(syncytium.removeGraphNode(session.sessionId, {
    opId: 'graph-remove-a', actorId: 'architect', id: 'A'
  }), (error) => error.conflicts.some((conflict) => conflict.type === 'GRAPH_DANGLING_EDGE'));

  await syncytium.updateGraphNode(session.sessionId, {
    opId: 'graph-node-a-update', actorId: 'architect', id: 'A', value: { label: 'A', owner: 'runtime' }
  });
  await syncytium.removeGraphEdge(session.sessionId, { opId: 'graph-remove-ab', actorId: 'architect', id: 'ab' });
  await syncytium.removeGraphNode(session.sessionId, { opId: 'graph-remove-a-2', actorId: 'architect', id: 'A' });
  const graph = (await syncytium.graphSnapshot(session.sessionId)).graph;
  assert.deepEqual(graph.nodes.map((node) => node.nodeId), ['B']);
  assert.deepEqual(graph.edges, []);
}

main().then(() => console.log('Syncytium graph variant checks: PASS')).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
