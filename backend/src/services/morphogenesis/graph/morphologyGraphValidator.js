'use strict';

const { EDGE_TYPES } = require('./morphologyEdge');

function validateMorphologyGraph(graph) {
  const errors = [];
  const nodes = Array.isArray(graph && graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph && graph.edges) ? graph.edges : [];
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  errors.push(...graphIdentityErrors(graph, nodes, byId));
  errors.push(...nodeParentErrors(graph, nodes, byId));
  errors.push(...edgeErrors(edges, byId));
  if (hasContainmentCycle(nodes, edges)) errors.push('containment relationships must be acyclic');
  return { valid: errors.length === 0, errors };
}

function graphIdentityErrors(graph, nodes, byId) {
  const errors = [];
  if (!graph || !graph.graphId) errors.push('graphId is required');
  if (!graph || !byId.has(graph.rootNodeId)) errors.push('rootNodeId must reference a node');
  if (byId.size !== nodes.length) errors.push('nodeId values must be unique');
  return errors;
}

function nodeParentErrors(graph, nodes, byId) {
  const errors = [];
  for (const node of nodes) {
    if (node.parentNodeId && !byId.has(node.parentNodeId)) errors.push(`unknown parent for node ${node.nodeId}`);
    if (graph && node.nodeId === graph.rootNodeId && node.parentNodeId) errors.push('root node cannot have a parent');
  }
  return errors;
}

function edgeErrors(edges, byId) {
  const errors = [];
  const edgeIds = new Set();
  for (const edge of edges) {
    if (!EDGE_TYPES.includes(edge.type)) errors.push(`unsupported edge type: ${edge.type}`);
    if (!byId.has(edge.fromNodeId) || !byId.has(edge.toNodeId)) errors.push(`edge ${edge.edgeId} references an unknown node`);
    if (edge.fromNodeId === edge.toNodeId) errors.push(`edge ${edge.edgeId} cannot connect a node to itself`);
    if (edgeIds.has(edge.edgeId)) errors.push('edgeId values must be unique');
    edgeIds.add(edge.edgeId);
  }
  return errors;
}

function hasContainmentCycle(nodes, edges = []) {
  const parents = new Map();
  for (const node of nodes) {
    if (node.parentNodeId) parents.set(node.nodeId, node.parentNodeId);
  }
  for (const edge of edges) {
    if (edge.type === 'CONTAINS') {
      if (parents.has(edge.toNodeId) && parents.get(edge.toNodeId) !== edge.fromNodeId) return true;
      parents.set(edge.toNodeId, edge.fromNodeId);
    }
  }
  for (const node of nodes) {
    const visited = new Set([node.nodeId]);
    let parent = parents.get(node.nodeId);
    while (parent) {
      if (visited.has(parent)) return true;
      visited.add(parent);
      parent = parents.get(parent);
    }
  }
  return false;
}

module.exports = { validateMorphologyGraph, hasContainmentCycle };
