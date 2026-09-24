'use strict';

function metricValue(observed, key, fallback) {
  return observed[key] === undefined ? fallback : observed[key];
}

function nodeView(node, metrics = {}) {
  const observed = metrics[node.nodeId] || {};
  return {
    nodeId: node.nodeId, parentNodeId: node.parentNodeId || null, topology: node.topology || null,
    profile: node.localProfile || null, whyExists: node.reason || null,
    cost: metricValue(observed, 'cost', null), value: metricValue(observed, 'value', null),
    health: metricValue(observed, 'health', node.health || null), ageMs: metricValue(observed, 'ageMs', null),
    pressure: metricValue(observed, 'pressure', []), candidates: metricValue(observed, 'nextTransitionCandidates', [])
  };
}

function buildMorphologyObservability(graph, metrics = {}) {
  return { graphId: graph.graphId, version: graph.version, rootNodeId: graph.rootNodeId, nodes: graph.nodes.map((node) => nodeView(node, metrics)) };
}

module.exports = { buildMorphologyObservability };
