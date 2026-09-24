'use strict';

const LEVELS = Object.freeze({ public: 0, internal: 1, confidential: 2, restricted: 3 });
const { nodesById } = require('./typingHelpers');

function checkPrivacy(graph) {
  const byId = nodesById(graph);
  return (graph.edges || []).flatMap((edge) => privacyEdgeErrors(edge, byId));
}

function privacyEdgeErrors(edge, byId) {
  if (edge.type !== 'COMMUNICATES') return [];
  const source = byId.get(edge.fromNodeId);
  const target = byId.get(edge.toNodeId);
  const sourcePolicy = source && source.communicationPolicy;
  const targetPolicy = target && target.communicationPolicy;
  const sourceLevel = LEVELS[sourcePolicy && sourcePolicy.classification];
  const clearance = LEVELS[targetPolicy && targetPolicy.clearance];
  if (sourceLevel !== undefined && clearance !== undefined && sourceLevel > clearance) {
    return [`communication edge ${edge.edgeId} exceeds destination privacy clearance`];
  }
  return [];
}

module.exports = { LEVELS, checkPrivacy };
