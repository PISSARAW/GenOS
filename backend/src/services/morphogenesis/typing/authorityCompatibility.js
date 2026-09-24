'use strict';

const { compareSet, nodesById } = require('./typingHelpers');
const { filterActions } = require('../firewalls/authorityFirewall');

function checkAuthority(graph) {
  const byId = nodesById(graph);
  const edgeErrors = (graph.edges || []).flatMap((edge) => authorityEdgeErrors(edge, byId, graph));
  const nodeErrors = (graph.nodes || []).flatMap((node) => nodeAuthorityErrors(node, byId));
  return edgeErrors.concat(nodeErrors);
}

function nodeAuthorityErrors(node, byId) {
  const parent = byId.get(node.parentNodeId);
  const parentCeiling = parent && parent.authorityBoundary && parent.authorityBoundary.maxActions;
  const childActions = node.authorityBoundary && node.authorityBoundary.maxActions;
  if (!Array.isArray(parentCeiling) || !Array.isArray(childActions)) return [];
  const excess = childActions.filter((action) => !parentCeiling.includes(action));
  return excess.length ? [`node ${node.nodeId} exceeds its parent authority envelope`] : [];
}

function authorityEdgeErrors(edge, byId, graph) {
  if (edge.type !== 'AUTHORIZES') return [];
  const source = byId.get(edge.fromNodeId);
  const target = byId.get(edge.toNodeId);
  const requested = edge.properties && edge.properties.grants;
  const granted = Array.isArray(requested) ? filterActions(graph, edge, requested) : requested;
  const allowed = target && target.authorityBoundary && target.authorityBoundary.allowedActions;
  const ceiling = source && source.authorityBoundary && source.authorityBoundary.maxActions;
  return [
    compareSet(allowed, granted).length ? `authority edge ${edge.edgeId} omits required grants` : null,
    compareSet(granted, ceiling).length ? `authority edge ${edge.edgeId} exceeds source authority` : null
  ].filter(Boolean);
}

module.exports = { checkAuthority };
