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
  const parentCeiling = parent && parent.authorityBoundary;
  const childActions = node.authorityBoundary;
  if (!Array.isArray(parentCeiling) || !Array.isArray(childActions)) return [];
  const excess = childActions.filter((action) => !parentCeiling.includes(action));
  return excess.length ? [`node ${node.nodeId} exceeds its parent authority envelope`] : [];
}

function authorityEdgeErrors(edge, byId, graph) {
  if (edge.type !== 'AUTHORIZES') return [];
  const source = byId.get(edge.fromNodeId);
  const target = byId.get(edge.toNodeId);
  const requested = edge.properties && edge.properties.grants;
  if (!Array.isArray(requested)) return ['authority edge must declare a grants array'];
  const granted = filterActions(graph, edge, requested);
  const allowed = target && target.authorityBoundary;
  const ceiling = source && source.authorityBoundary;
  if (!Array.isArray(allowed) || !Array.isArray(ceiling)) {
    return [`authority edge ${edge.edgeId} requires source and target authority boundaries`];
  }
  return [
    compareSet(requested, granted).length ? `authority edge ${edge.edgeId} requests a firewall-denied grant` : null,
    compareSet(granted, allowed).length ? `authority edge ${edge.edgeId} grants an action outside target authority` : null,
    compareSet(granted, ceiling).length ? `authority edge ${edge.edgeId} exceeds source authority` : null
  ].filter(Boolean);
}

module.exports = { checkAuthority };
