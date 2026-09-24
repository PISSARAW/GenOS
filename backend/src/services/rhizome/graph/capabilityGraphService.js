'use strict';

const nodeRegistry = require('./nodeRegistry');
const edgeRegistry = require('./edgeRegistry');
const { validateGraph } = require('./graphValidation');

const SNAPSHOT_CONTRACT = 'RhizomeGraphSnapshot/v1';

function snapshot(session) {
  const graph = validateGraph(session);
  return {
    contract: SNAPSHOT_CONTRACT,
    rhizomeId: session.rhizomeId,
    missionId: session.missionId,
    graphVersion: session.graphVersion,
    nodes: graph.nodes,
    edges: graph.edges
  };
}

function addNode(session, input) {
  return { ...session, nodes: nodeRegistry.register(session.nodes, input), graphVersion: session.graphVersion + 1 };
}

function addEdge(session, input) {
  const edges = edgeRegistry.register(session.edges, session.nodes, input);
  return { ...session, edges, graphVersion: session.graphVersion + 1 };
}

module.exports = { snapshot, addNode, addEdge, SNAPSHOT_CONTRACT };
