'use strict';

function nodesById(graph) {
  return new Map((graph.nodes || []).map((node) => [node.nodeId, node]));
}

function contractFor(node, contracts) {
  if (!node || !node.topology) return {};
  const key = String(node.topology).toLowerCase().replace(/[- ]/g, '_');
  return contracts[node.topology] || contracts[key] || {};
}

function lifecycleIsSealed(node, parent) {
  const values = [node && node.lifecycle, parent && parent.lifecycle];
  return values.some((value) => ['sealed', 'committed', 'after_commitment'].includes(value));
}

function compareSet(required, provided) {
  if (!Array.isArray(required) || !Array.isArray(provided)) return [];
  return required.filter((item) => !provided.includes(item));
}

function parentOf(node, byId) {
  return byId.get(node.parentNodeId) || null;
}

module.exports = { compareSet, contractFor, lifecycleIsSealed, nodesById, parentOf };
