'use strict';

const { normalizeCapabilityEdge } = require('../contracts/capabilityEdge');

function register(edges, nodes, input) {
  const edge = normalizeCapabilityEdge(input);
  if (edges.some((item) => item.edgeId === edge.edgeId)) {
    throw Object.assign(new Error(`Rhizome edge '${edge.edgeId}' already exists.`), { code: 'RHIZOME_EDGE_EXISTS' });
  }
  const nodeIds = new Set(nodes.map((node) => node.nodeId));
  if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
    throw Object.assign(new Error(`Rhizome edge '${edge.edgeId}' has an unknown endpoint.`), { code: 'RHIZOME_GRAPH_INVALID', field: 'edges' });
  }
  return [...edges, edge];
}

module.exports = { register };
