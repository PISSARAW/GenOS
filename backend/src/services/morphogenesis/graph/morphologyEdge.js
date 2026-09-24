'use strict';

const { randomUUID } = require('crypto');

const EDGE_TYPES = Object.freeze([
  'CONTAINS', 'COMMUNICATES', 'AUTHORIZES', 'SHARES_STATE', 'EXCHANGES_EVIDENCE', 'ALLOCATES_RESOURCE', 'MIGRATES'
]);

function createMorphologyEdge(input = {}) {
  const edge = {
    edgeId: input.edgeId || randomUUID(),
    type: input.type,
    fromNodeId: input.fromNodeId,
    toNodeId: input.toNodeId,
    properties: input.properties || {}
  };
  if (!EDGE_TYPES.includes(edge.type)) throw new Error(`Unsupported morphology edge type: ${edge.type}`);
  return edge;
}

module.exports = { EDGE_TYPES, createMorphologyEdge };
