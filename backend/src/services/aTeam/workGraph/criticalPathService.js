'use strict';

function criticalPath(graph, analysis) {
  const nodes = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  const best = new Map();
  const previous = new Map();
  for (const layer of analysis.layers) {
    for (const nodeId of layer) scoreNode({ nodeId, nodes, inbound: analysis.inbound, best, previous });
  }
  const terminal = terminalNode(best, analysis.outbound);
  return { nodeIds: unwind(terminal, previous), weight: Number(best.get(terminal) || 0), basis: 'estimated_duration_or_unit_weight' };
}

function scoreNode({ nodeId, nodes, inbound, best, previous }) {
  const node = nodes.get(nodeId);
  const duration = Number(node.estimatedDuration);
  const ownWeight = Number.isFinite(duration) && duration > 0 ? duration : 1;
  let priorNode = null;
  let priorWeight = 0;
  for (const dependency of inbound.get(nodeId)) {
    if (best.get(dependency) > priorWeight) {
      priorNode = dependency;
      priorWeight = best.get(dependency);
    }
  }
  best.set(nodeId, priorWeight + ownWeight);
  previous.set(nodeId, priorNode);
}

function terminalNode(scores, outbound) {
  const terminals = [...outbound].filter(([, targets]) => targets.length === 0).map(([nodeId]) => nodeId);
  return terminals.reduce((best, nodeId) => (scores.get(nodeId) > scores.get(best) ? nodeId : best), terminals[0]);
}

function unwind(nodeId, previous) {
  const path = [];
  let current = nodeId;
  while (current) {
    path.unshift(current);
    current = previous.get(current);
  }
  return path;
}

module.exports = { criticalPath };
