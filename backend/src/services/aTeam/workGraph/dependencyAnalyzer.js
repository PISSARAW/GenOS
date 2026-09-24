'use strict';

function analyzeDependencies(graph) {
  const inbound = new Map(graph.nodes.map((node) => [node.nodeId, []]));
  const outbound = new Map(graph.nodes.map((node) => [node.nodeId, []]));
  for (const edge of graph.edges) {
    if (edge.blocking === false) continue;
    inbound.get(edge.toNode).push(edge.fromNode);
    outbound.get(edge.fromNode).push(edge.toNode);
  }
  const layers = topologicalLayers(graph.nodes, inbound, outbound);
  return { inbound, outbound, layers, nodeStages: stageIndex(layers) };
}

function topologicalLayers(nodes, inbound, outbound) {
  const remaining = new Map(nodes.map((node) => [node.nodeId, inbound.get(node.nodeId).length]));
  let ready = nodes.filter((node) => remaining.get(node.nodeId) === 0).map((node) => node.nodeId);
  const layers = [];
  let visited = 0;
  while (ready.length) {
    const layer = ready;
    const next = [];
    visited += layer.length;
    for (const nodeId of layer) {
      for (const target of outbound.get(nodeId)) {
        remaining.set(target, remaining.get(target) - 1);
        if (remaining.get(target) === 0) next.push(target);
      }
    }
    layers.push(layer);
    ready = next;
  }
  if (visited !== nodes.length) throw Object.assign(new Error('Cannot analyze a cyclic WorkGraph.'), { code: 'ATEAM_WORK_GRAPH_CYCLE' });
  return layers;
}

function stageIndex(layers) {
  const index = {};
  layers.forEach((layer, stage) => layer.forEach((nodeId) => { index[nodeId] = stage; }));
  return index;
}

module.exports = { analyzeDependencies };
