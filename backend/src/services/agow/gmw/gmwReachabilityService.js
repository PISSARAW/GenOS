'use strict';

function measure(samples) {
  const nodes = [...new Set(samples.flatMap((sample) => [sample.source, sample.target]))];
  if (nodes.length < 2) return { score: 0, reachablePairs: 0, possiblePairs: 0 };
  const edges = new Map(nodes.map((node) => [node, new Set()]));
  samples.forEach((sample) => edges.get(sample.source)?.add(sample.target));
  let reachablePairs = 0;
  for (const source of nodes) reachablePairs += reachableFrom(source, edges).size - 1;
  const possiblePairs = nodes.length * (nodes.length - 1);
  return { score: reachablePairs / possiblePairs, reachablePairs, possiblePairs };
}

function reachableFrom(source, edges) {
  const visited = new Set([source]);
  const queue = [source];
  while (queue.length) {
    for (const target of edges.get(queue.shift()) || []) {
      if (!visited.has(target)) { visited.add(target); queue.push(target); }
    }
  }
  return visited;
}

module.exports = { measure, reachableFrom };
