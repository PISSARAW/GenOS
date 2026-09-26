'use strict';

const DEFAULT_MAX_SOURCES = 8;
const DEFAULT_MAX_HOPS = 4;

function approximateBetweenness(session) {
  const nodes = session.nodes || [];
  const edges = (session.edges || []).filter(isActiveEdge);
  if (nodes.length < 3 || edges.length < 2) return null;
  const adj = buildAdjacency(nodes, edges);
  const activeNodeIds = nodeIdsWithNeighbors(adj);
  if (activeNodeIds.length < 2) return null;
  const sources = sourcesRankedByDegree(activeNodeIds, adj, DEFAULT_MAX_SOURCES);
  if (!sources.length) return null;
  const accumulator = new Map();
  for (const node of nodes) accumulator.set(node.nodeId, 0);
  for (const source of sources) {
    const ctx = brandesContext(source, adj, accumulator);
    expandUpToHops(ctx);
    backpropagateFromStack(ctx);
  }
  return normalizedBetweenness(accumulator, sources.length);
}

function isActiveEdge(edge) { return edge.status === 'ACTIVE'; }

function buildAdjacency(nodes, activeEdges) {
  const adj = new Map();
  for (const node of nodes) adj.set(node.nodeId, []);
  for (const edge of activeEdges) {
    (adj.get(edge.from) || []).push(edge.to);
    (adj.get(edge.to) || []).push(edge.from);
  }
  return adj;
}

function nodeIdsWithNeighbors(adj) {
  return [...adj.keys()].filter(function (id) { return (adj.get(id) || []).length > 0; });
}

function sourcesRankedByDegree(activeNodeIds, adj, maxSources) {
  const ranked = activeNodeIds.map(function (id) {
    return { id: id, degree: (adj.get(id) || []).length };
  });
  ranked.sort(function (a, b) { return b.degree - a.degree; });
  return ranked.slice(0, maxSources).map(function (r) { return r.id; });
}

function normalizedBetweenness(accumulator, sourceCount) {
  const normalized = new Map();
  const divisor = Math.max(1, sourceCount);
  for (const [id, value] of accumulator) normalized.set(id, value / divisor);
  return normalized;
}

function brandesContext(source, adj, accumulator) {
  const stack = [];
  const predecessors = new Map();
  const sigma = new Map([[source, 1]]);
  const distance = new Map([[source, 0]]);
  const queue = [source];
  let head = 0;
  return {
    source,
    adj,
    accumulator,
    stack,
    predecessors,
    sigma,
    distance,
    queue,
    head: function () { return head; },
    advanceHead: function () { head += 1; },
    maxHops: DEFAULT_MAX_HOPS
  };
}

function expandUpToHops(ctx) {
  while (ctx.head() < ctx.queue.length) {
    const v = ctx.queue[ctx.head()];
    ctx.stack.push(v);
    const dv = ctx.distance.get(v);
    if (dv < ctx.maxHops) {
      for (const w of (ctx.adj.get(v) || [])) {
        if (!ctx.distance.has(w)) {
          ctx.distance.set(w, dv + 1);
          ctx.queue.push(w);
        }
        if (ctx.distance.get(w) === dv + 1) {
          ctx.sigma.set(w, (ctx.sigma.get(w) || 0) + ctx.sigma.get(v));
          if (!ctx.predecessors.has(w)) ctx.predecessors.set(w, []);
          ctx.predecessors.get(w).push(v);
        }
      }
    }
    ctx.advanceHead();
  }
}

function backpropagateFromStack(ctx) {
  const delta = new Map();
  while (ctx.stack.length) {
    const w = ctx.stack.pop();
    const dw = delta.get(w) || 0;
    const preds = ctx.predecessors.get(w) || [];
    for (const v of preds) {
      delta.set(v, (delta.get(v) || 0) + (ctx.sigma.get(v) / ctx.sigma.get(w)) * (1 + dw));
    }
    if (w !== ctx.source) ctx.accumulator.set(w, (ctx.accumulator.get(w) || 0) + dw);
  }
}

module.exports = { approximateBetweenness };
