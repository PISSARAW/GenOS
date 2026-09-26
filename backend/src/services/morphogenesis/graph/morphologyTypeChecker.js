'use strict';

const ARITY = Object.freeze({
  NEST: { min: 2, max: 2 },
  PARALLEL: { min: 1, max: 32 },
  SEQUENCE: { min: 1, max: 32 },
  GATE: { min: 3, max: 3 },
  COMPETE: { min: 2, max: 16 },
  WRAP: { min: 1, max: 1 },
  BRIDGE: { min: 2, max: 2 },
  FEDERATE: { min: 2, max: 32 }
});

function checkGraph(input) {
  const errors = [];
  if (!input || !input.graph) errors.push('graph is required');
  if (errors.length > 0) return { valid: false, errors };
  const graph = input.graph;
  checkRoot(graph, errors);
  checkNodes(graph, errors);
  return { valid: errors.length === 0, errors };
}

function checkRoot(graph, errors) {
  if (!graph.rootNodeId) errors.push('rootNodeId is required');
  const root = graph.nodes.find((node) => node.nodeId === graph.rootNodeId);
  if (!root) errors.push('rootNodeId must reference a node');
}

function checkNodes(graph, errors) {
  for (const node of graph.nodes) checkNode(graph, node, errors);
}

function checkNode(graph, node, errors) {
  checkArity(graph, node, errors);
  checkTopologyNode(node, errors);
  checkPorts(node, errors);
  checkBoundaries(node, errors);
}

function checkArity(graph, node, errors) {
  if (!node.operator) return;
  const rule = ARITY[node.operator];
  if (!rule) errors.push(`unknown operator: ${node.operator}`);
  if (!rule) return;
  const count = childCount(graph, node);
  if (count < rule.min || count > rule.max) {
    errors.push(`${node.operator} requires ${rule.min}-${rule.max} children, got ${count}`);
  }
}

function childCount(graph, node) {
  if (Array.isArray(node.children) && node.children.length > 0) return node.children.length;
  return graph.nodes.filter((child) => child.parentNodeId === node.nodeId).length;
}

function checkTopologyNode(node, errors) {
  if (node.kind !== 'TOPOLOGY') return;
  if (!node.topology || typeof node.topology !== 'string') {
    errors.push(`TOPOLOGY node ${node.nodeId} requires a string topology`);
  }
}

function checkPorts(node, errors) {
  const groups = ['inputPorts', 'outputPorts', 'statePorts', 'evidencePorts', 'controlPorts', 'resourcePorts'];
  for (const group of groups) checkPortGroup(node, group, errors);
}

function checkPortGroup(node, group, errors) {
  const ports = node[group];
  if (ports === undefined) return;
  if (!Array.isArray(ports)) errors.push(`${group} of ${node.nodeId} must be an array`);
}

function checkBoundaries(node, errors) {
  checkBoundaryList(node, 'authorityBoundary', errors);
  checkBoundaryList(node, 'stateBoundary', errors);
}

function checkBoundaryList(node, field, errors) {
  const value = node[field];
  if (value === null || value === undefined) return;
  if (!Array.isArray(value)) errors.push(`${field} of ${node.nodeId} must be an array or null`);
}

module.exports = { ARITY, checkGraph };
