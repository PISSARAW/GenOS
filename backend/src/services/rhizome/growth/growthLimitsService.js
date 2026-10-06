'use strict';

function branchLimit(limits) { return limits.maxBranches ?? 8; }

function check(session, candidate) {
  const limits = session.growthLimits || {};
  const spawned = (session.nodes || []).filter(node => node.localContext?.rhizomeGrowth === true).length;
  const maxBranches = branchLimit(limits);
  if (['SPAWN_WORKER', 'SPAWN_SUB_TOPOLOGY', 'ATTACH_SERVICE'].includes(candidate.action) && spawned >= maxBranches) return false;
  const depth = Math.max(0, ...candidate.targetNodeIds.map(id => (session.nodes || []).find(node => node.nodeId === id)?.localContext?.growthDepth || 0));
  return depth < (limits.maxDepth ?? 4) && candidate.creationCost + candidate.coordinationCost >= (limits.minBranchBudget || 0);
}

function annotate(node, session, candidate) {
  const depth = Math.max(0, ...candidate.targetNodeIds.map(id => (session.nodes || []).find(item => item.nodeId === id)?.localContext?.growthDepth || 0));
  return { ...node, localContext: { ...node.localContext, rhizomeGrowth: true, growthDepth: session.nodes.some(item => item.nodeId === node.nodeId) ? depth : depth + 1 } };
}

module.exports = { check, annotate };
