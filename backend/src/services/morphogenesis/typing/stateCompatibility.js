'use strict';

const { lifecycleIsSealed, nodesById, parentOf } = require('./typingHelpers');

function findTrinityBranch(node, byId) {
  let branch = node;
  let parent = parentOf(branch, byId);
  while (parent) {
    if (String(parent.topology).toLowerCase() === 'trinity') return { branch, trinity: parent };
    branch = parent;
    parent = parentOf(branch, byId);
  }
  return null;
}

function checkState(graph) {
  const byId = nodesById(graph);
  return (graph.edges || []).flatMap((edge) => stateEdgeErrors(edge, byId));
}

function stateEdgeErrors(edge, byId) {
  if (edge.type !== 'SHARES_STATE') return [];
  const sourceBranch = findTrinityBranch(byId.get(edge.fromNodeId), byId);
  const targetBranch = findTrinityBranch(byId.get(edge.toNodeId), byId);
  if (!crossesBranches(sourceBranch, targetBranch)) return [];
  if (!isLive(edge) || !isSealed(sourceBranch, targetBranch) || hasFirewall(edge)) return [];
  return [`live shared state edge ${edge.edgeId} crosses a sealed boundary without a firewall`];
}

function crossesBranches(source, target) {
  return Boolean(source && target && source.trinity.nodeId === target.trinity.nodeId
    && source.branch.nodeId !== target.branch.nodeId);
}

function isLive(edge) {
  return Boolean(edge.properties && edge.properties.mode === 'live');
}

function hasFirewall(edge) {
  return Boolean(edge.properties && edge.properties.firewall === true);
}

function isSealed(source, target) {
  return lifecycleIsSealed(source.branch, source.trinity) || lifecycleIsSealed(target.branch, target.trinity);
}

module.exports = { checkState };
