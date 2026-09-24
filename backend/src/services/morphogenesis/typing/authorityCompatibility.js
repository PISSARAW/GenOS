'use strict';

const { compareSet, nodesById } = require('./typingHelpers');

function checkAuthority(graph) {
  const byId = nodesById(graph);
  return (graph.edges || []).flatMap((edge) => authorityEdgeErrors(edge, byId));
}

function authorityEdgeErrors(edge, byId) {
  if (edge.type !== 'AUTHORIZES') return [];
  const source = byId.get(edge.fromNodeId);
  const target = byId.get(edge.toNodeId);
  const granted = edge.properties && edge.properties.grants;
  const allowed = target && target.authorityBoundary && target.authorityBoundary.allowedActions;
  const ceiling = source && source.authorityBoundary && source.authorityBoundary.maxActions;
  return [
    compareSet(allowed, granted).length ? `authority edge ${edge.edgeId} omits required grants` : null,
    compareSet(granted, ceiling).length ? `authority edge ${edge.edgeId} exceeds source authority` : null
  ].filter(Boolean);
}

module.exports = { checkAuthority };
