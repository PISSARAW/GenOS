'use strict';

const { identifier, scopeKey } = require('./contract');
const LIMITS = Object.freeze({ nodes: 128, edges: 512, hops: 4, fanout: 8, deliveries: 64, ttl: 15000 });

function compileGraph(input, scope) {
  const nodes = input?.nodes || [];
  const edges = input?.edges || [];
  if (nodes.length > LIMITS.nodes || edges.length > LIMITS.edges) throw new Error('GRAPH_CAPACITY');
  const expected = scopeKey(scope);
  const graph = new Map();
  for (const node of nodes) {
    if (scopeKey(node.scope) !== expected) throw new Error('CROSS_TENANT_GRAPH');
    const id = identifier(node.id, 'nodeId');
    if (graph.has(id)) throw new Error('DUPLICATE_NODE');
    graph.set(id, new Set());
  }
  for (const edge of edges) addEdge(graph, edge);
  return graph;
}

function addEdge(graph, edge) {
  if (!graph.has(edge.from) || !graph.has(edge.to)) throw new Error('UNKNOWN_GRAPH_NODE');
  graph.get(edge.from).add(edge.to);
}

function propagation(graph, signal, now) {
  const expiresAt = signal.observedAt + LIMITS.ttl;
  if (now >= expiresAt || !graph.has(signal.agentId)) return [];
  const queue = [{ nodeId: signal.agentId, amplitude: 1, hop: 0 }];
  const visited = new Set([signal.agentId]);
  const deliveries = [];
  for (let i = 0; i < queue.length && deliveries.length < LIMITS.deliveries; i += 1) {
    const current = queue[i];
    if (current.hop >= LIMITS.hops) continue;
    expand({ graph, current, visited, queue, deliveries, expiresAt });
  }
  return deliveries;
}

function expand(context) {
  const neighbors = [...context.graph.get(context.current.nodeId)].sort().slice(0, LIMITS.fanout);
  for (const nodeId of neighbors) {
    if (context.visited.has(nodeId) || context.deliveries.length >= LIMITS.deliveries) continue;
    context.visited.add(nodeId);
    const delivery = { nodeId, hop: context.current.hop + 1,
      amplitude: context.current.amplitude * 0.6, expiresAt: context.expiresAt };
    context.queue.push(delivery);
    context.deliveries.push(delivery);
  }
}

module.exports = { LIMITS, compileGraph, propagation };
