'use strict';

const { normalizeCapabilityNode } = require('../contracts/capabilityNode');
const { normalizeCapabilityEdge } = require('../contracts/capabilityEdge');

function uniqueBy(items, key, field) {
  const normalized = items.map((item) => field === 'nodes' ? normalizeCapabilityNode(item) : normalizeCapabilityEdge(item));
  const ids = normalized.map((item) => item[key]);
  if (new Set(ids).size !== ids.length) invalid(field, `duplicate ${key}`);
  return normalized;
}

function invalid(field, reason) {
  throw Object.assign(new Error(`Invalid Rhizome graph ${field}: ${reason}`), { code: 'RHIZOME_GRAPH_INVALID', field });
}

function validateGraph(value) {
  const nodes = uniqueBy(value.nodes || [], 'nodeId', 'nodes');
  const edges = uniqueBy(value.edges || [], 'edgeId', 'edges');
  const ids = new Set(nodes.map((node) => node.nodeId));
  for (const edge of edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) invalid('edges', `unknown endpoint for '${edge.edgeId}'`);
  }
  return { nodes, edges };
}

module.exports = { validateGraph };
