'use strict';

const { randomUUID } = require('crypto');
const { createMorphologyNode } = require('./morphologyNode');
const { createMorphologyEdge } = require('./morphologyEdge');

function valueOr(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

function createMorphologyGraph(input = {}) {
  const nodes = (input.nodes ?? []).map(createMorphologyNode);
  const edges = (input.edges ?? []).map(createMorphologyEdge);
  const rootNodeId = valueOr(input.rootNodeId, nodes[0] && nodes[0].nodeId);
  const graph = {
    graphId: valueOr(input.graphId, randomUUID()),
    missionId: valueOr(input.missionId, null),
    rootNodeId: rootNodeId || null,
    nodes,
    edges,
    version: Number.isInteger(input.version) ? input.version : 1,
    status: valueOr(input.status, 'proposed'),
    globalBudget: valueOr(input.globalBudget, {}),
    globalInvariants: Array.isArray(input.globalInvariants) ? [...input.globalInvariants] : [],
    parentVersion: valueOr(input.parentVersion, null),
    createdAt: valueOr(input.createdAt, new Date().toISOString())
  };
  if (input.rootNode) {
    const root = createMorphologyNode({ ...input.rootNode, parentNodeId: null });
    graph.nodes.unshift(root);
    graph.rootNodeId = root.nodeId;
  }
  return graph;
}

module.exports = { createMorphologyGraph };
