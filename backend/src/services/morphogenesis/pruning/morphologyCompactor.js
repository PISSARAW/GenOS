'use strict';

function compactGraph(graph, plan) {
  if (!graph || !Array.isArray(graph.nodes) || !plan || plan.approved !== true) {
    throw new Error('an approved pruning plan and morphology graph are required');
  }
  if (!Number.isSafeInteger(graph.version) || graph.version < 0) throw new Error('graph version must be a non-negative integer');
  const retired = new Set(plan.nodeIds || []);
  return {
    ...graph,
    nodes: graph.nodes.filter((node) => !retired.has(node.id)),
    archivedNodeIds: [...new Set([...(graph.archivedNodeIds || []), ...retired])],
    version: graph.version + 1
  };
}

module.exports = { compactGraph };
