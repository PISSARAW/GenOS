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
  if (!validBoundaries(allowed, ceiling)) return missingBoundaryError(edge.edgeId);
  return firewallGrantErrors(edge, requested, granted)
    .concat(targetGrantErrors(edge, granted, allowed))
    .concat(sourceGrantErrors(edge, granted, ceiling));
}

function validBoundaries(allowed, ceiling) {
  return Array.isArray(allowed) && Array.isArray(ceiling);
}

function missingBoundaryError(edgeId) {
  return [`authority edge ${edgeId} requires source and target authority boundaries`];
}

function firewallGrantErrors(edge, requested, granted) {
  if (!compareSet(requested, granted).length) return [];
  return [`authority edge ${edge.edgeId} requests a firewall-denied grant`];
}

function targetGrantErrors(edge, granted, allowed) {
  if (!compareSet(granted, allowed).length) return [];
  return [`authority edge ${edge.edgeId} grants an action outside target authority`];
}

function sourceGrantErrors(edge, granted, ceiling) {
  if (!compareSet(granted, ceiling).length) return [];
  return [`authority edge ${edge.edgeId} exceeds source authority`];
}

module.exports = { checkAuthority };
