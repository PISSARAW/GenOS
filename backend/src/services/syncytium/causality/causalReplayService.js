'use strict';

function compareOperations(left, right) {
  return (left.timestampMs - right.timestampMs) || (left.lamport - right.lamport)
    || String(left.actorId || left.agentId).localeCompare(String(right.actorId || right.agentId))
    || String(left.opId).localeCompare(String(right.opId));
}

function orderOperations(operations) {
  const nodes = [...operations].sort(compareOperations).map((operation, rank) => ({
    operation, rank, remaining: 0, successors: []
  }));
  const actors = indexActors(nodes);
  for (const node of nodes) linkDependencies(node, actors);
  const ready = nodes.filter((node) => node.remaining === 0);
  const ordered = [];
  while (ready.length) {
    const node = ready.shift();
    ordered.push(node.operation);
    for (const successor of node.successors) {
      successor.remaining -= 1;
      if (successor.remaining === 0) insertReady(ready, successor);
    }
  }
  if (ordered.length !== nodes.length) {
    throw Object.assign(new Error('Operation history contains a causal cycle.'), {
      code: 'SYNCYTIUM_CAUSAL_CYCLE'
    });
  }
  return ordered;
}

function indexActors(nodes) {
  const actors = new Map();
  for (const node of nodes) {
    const dot = node.operation.dot;
    if (!dot) continue;
    if (!actors.has(dot.actorId)) actors.set(dot.actorId, []);
    actors.get(dot.actorId).push(node);
  }
  for (const group of actors.values()) group.sort((a, b) => a.operation.dot.sequence - b.operation.dot.sequence);
  return actors;
}

function linkDependencies(node, actors) {
  const dependencies = new Set();
  for (const [actor, sequence] of Object.entries(node.operation.causalContext || {})) {
    const previous = predecessor(actors.get(actor) || [], sequence);
    if (previous && previous !== node) dependencies.add(previous);
  }
  node.remaining = dependencies.size;
  for (const dependency of dependencies) dependency.successors.push(node);
}

function predecessor(group, sequence) {
  let low = 0;
  let high = group.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (group[middle].operation.dot.sequence <= sequence) low = middle + 1;
    else high = middle;
  }
  return group[low - 1];
}

function insertReady(ready, node) {
  let low = 0;
  let high = ready.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (ready[middle].rank < node.rank) low = middle + 1;
    else high = middle;
  }
  ready.splice(low, 0, node);
}

module.exports = { orderOperations };
