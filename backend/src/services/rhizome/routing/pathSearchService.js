'use strict';

function positiveInteger(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function adjacency(edges) {
  const index = new Map();
  for (const edge of edges) {
    if (edge.status !== 'ACTIVE') continue;
    if (!index.has(edge.from)) index.set(edge.from, []);
    index.get(edge.from).push(edge);
  }
  for (const items of index.values()) items.sort((a, b) => a.edgeId.localeCompare(b.edgeId));
  return index;
}

function expand(current, input, pending) {
  if (current.edges.length >= input.maxHops) return;
  const outgoing = input.adjacency.get(current.nodeIds.at(-1)) || [];
  for (const edge of outgoing) {
    if (input.work.inspectedEdges >= input.maxWork) { input.work.exhausted = true; return; }
    input.work.inspectedEdges += 1;
    input.onWork?.(1);
    if (!input.activeIds.has(edge.to) || current.nodeIds.includes(edge.to)) continue;
    if (pending.length >= input.maxStates) { input.work.exhausted = true; return; }
    pending.push({ nodeIds: [...current.nodeIds, edge.to], edges: [...current.edges, edge] });
  }
}

function find(input) {
  const work = { inspectedEdges: 0, visitedStates: 0, exhausted: false };
  const maxStates = positiveInteger(input.maxStates, 10000);
  const maximum = positiveInteger(input.maxWork, 100000);
  const context = { ...input, adjacency: adjacency(input.session.edges || []), work,
    maxStates, maxWork: maximum, maxHops: Math.min(input.activeIds.size, input.maxHops) };
  const pending = input.starts.slice(0, maxStates).map(nodeId => ({ nodeIds: [nodeId], edges: [] }));
  const paths = [];
  work.exhausted = input.starts.length > maxStates;
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const current = pending[cursor];
    paths.push(current);
    work.visitedStates += 1;
    if (!work.exhausted) expand(current, context, pending);
  }
  return { paths, search: { ...work, maxStates, maxWork: maximum } };
}

module.exports = { find };
