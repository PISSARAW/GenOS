'use strict';
const { normalizeCorridor } = require('../contracts/corridorContract');
const { evaluateCorridor } = require('./corridorQualityService');

const POLICIES = Object.freeze(['ring', 'stepping-stone', 'star', 'small-world', 'fully-connected', 'source-sink', 'hierarchical', 'adaptive']);
const POLICY_BUILDERS = {
  'fully-connected': (nodes) => everyDirectedPair(nodes),
  star: (nodes, options) => starPairs(nodes, options.centerDemeId || nodes[0]),
  'source-sink': (nodes, options) => selectedPairs(options.sources || [], options.sinks || [], nodes),
  hierarchical: (nodes) => hierarchyPairs(nodes),
  adaptive: (nodes, options) => adaptivePairs(options.candidateEdges || [], options.minimumWeight || 0),
  'small-world': (nodes) => smallWorldPairs(nodes),
  ring: (nodes) => ringPairs(nodes, false),
  'stepping-stone': (nodes) => ringPairs(nodes, true)
};

function buildCorridors(demes, options = {}) {
  const nodes = [...new Set((demes || []).map((deme) => typeof deme === 'string' ? deme : deme.demeId).filter(Boolean))].sort();
  const policy = options.policy || 'ring';
  if (!POLICIES.includes(policy)) throw Object.assign(new Error('Unsupported corridor topology policy.'), { code: 'METAPOPULATION_TOPOLOGY_POLICY_INVALID' });
  const pairs = policyPairs(nodes, policy, options);
  const metrics = options.metrics || {};
  return [...pairs].map(([sourceDemeId, targetDemeId]) => normalizeCorridor({
    ...evaluateCorridor(options.patchesByDeme?.[sourceDemeId], options.patchesByDeme?.[targetDemeId], metrics[`${sourceDemeId}->${targetDemeId}`]),
    ...(metrics[`${sourceDemeId}->${targetDemeId}`] || {}), sourceDemeId, targetDemeId
  }));
}

function policyPairs(nodes, policy, options) {
  if (nodes.length < 2) return [];
  return POLICY_BUILDERS[policy](nodes, options);
}

function everyDirectedPair(nodes) {
  return nodes.flatMap((source) => nodes.filter((target) => target !== source).map((target) => [source, target]));
}

function starPairs(nodes, center) {
  if (!nodes.includes(center)) throw Object.assign(new Error('Star center must be a deme in the graph.'), { code: 'METAPOPULATION_TOPOLOGY_CENTER_INVALID' });
  return nodes.filter((node) => node !== center).flatMap((node) => [[center, node], [node, center]]);
}

function selectedPairs(sources, sinks, nodes) {
  if (!Array.isArray(sources) || !Array.isArray(sinks)) throw Object.assign(new Error('Sources and sinks must be arrays.'), { code: 'METAPOPULATION_TOPOLOGY_NODE_INVALID' });
  const known = new Set(nodes);
  if (sources.some((node) => !known.has(node)) || sinks.some((node) => !known.has(node))) {
    throw Object.assign(new Error('Source and sink demes must exist in the graph.'), { code: 'METAPOPULATION_TOPOLOGY_NODE_INVALID' });
  }
  return sources.flatMap((source) => sinks.filter((sink) => sink !== source).map((sink) => [source, sink]));
}

function hierarchyPairs(nodes) {
  return nodes.slice(1).flatMap((node, index) => [[nodes[Math.floor(index / 2)], node]]);
}

function adaptivePairs(edges, minimumWeight) {
  return edges.filter((edge) => Number(edge.weight) >= minimumWeight && edge.enabled !== false)
    .map((edge) => [edge.sourceDemeId, edge.targetDemeId]);
}

function smallWorldPairs(nodes) {
  const pairs = new Map(ringPairs(nodes, false).map((pair) => [pair.join('->'), pair]));
  nodes.forEach((node, index) => {
    if (index % 2 === 0 && nodes.length > 3) {
      const target = nodes[(index + 2) % nodes.length];
      if (node !== target) pairs.set(`${node}->${target}`, [node, target]);
    }
  });
  return [...pairs.values()];
}

function ringPairs(nodes, bidirectional) {
  const pairs = nodes.map((node, index) => [node, nodes[(index + 1) % nodes.length]]);
  if (bidirectional) pairs.push(...nodes.map((node, index) => [node, nodes[(index + nodes.length - 1) % nodes.length]]));
  return [...new Map(pairs.filter(([source, target]) => source !== target).map((pair) => [pair.join('->'), pair])).values()];
}

module.exports = { buildCorridors, POLICIES };
