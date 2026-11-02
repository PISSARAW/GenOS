'use strict';

const { compileGraph } = require('./propagation');

function mergeGraphs(graphs, scope) {
  const nodes = new Map();
  const edges = new Map();
  for (const input of graphs.filter(Boolean)) {
    const graph = compileGraph(input, scope);
    for (const [from, neighbors] of graph) {
      nodes.set(from, { id: from, scope });
      for (const to of neighbors) edges.set(JSON.stringify([from, to]), { from, to });
    }
  }
  const result = { nodes: [...nodes.values()], edges: [...edges.values()] };
  compileGraph(result, scope);
  return result;
}

async function loadGraph(input) {
  const graphs = await Promise.all([
    require('./rpeAdapter').loadGraph(input), require('./topologyAdapter').loadGraph(input)
  ]);
  return mergeGraphs(graphs, input.scope);
}

module.exports = { loadGraph, mergeGraphs };
