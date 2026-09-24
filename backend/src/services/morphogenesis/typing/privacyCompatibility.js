'use strict';

const { nodesById } = require('./typingHelpers');
const { permitsFlow } = require('../firewalls/privacyFirewall');
const { PRIVACY_LEVELS: LEVELS } = require('./privacyLevels');

function checkPrivacy(graph) {
  const byId = nodesById(graph);
  return (graph.edges || []).flatMap((edge) => privacyEdgeErrors(edge, byId, graph));
}

function privacyEdgeErrors(edge, byId, graph) {
  if (edge.type !== 'COMMUNICATES') return [];
  const source = byId.get(edge.fromNodeId);
  const target = byId.get(edge.toNodeId);
  const sourcePolicy = source && source.communicationPolicy;
  const targetPolicy = target && target.communicationPolicy;
  const sourceLevel = LEVELS[sourcePolicy && sourcePolicy.classification];
  const clearance = LEVELS[targetPolicy && targetPolicy.clearance];
  const knownLevels = sourceLevel !== undefined && clearance !== undefined;
  if (knownLevels && !permitsFlow(graph, edge, { sourceLevel, clearance })) {
    return [`communication edge ${edge.edgeId} exceeds destination privacy clearance`];
  }
  return [];
}

module.exports = { LEVELS, checkPrivacy };
