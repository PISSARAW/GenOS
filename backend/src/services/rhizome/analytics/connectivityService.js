'use strict';

function isActiveNode(node, excludedNode) {
  if (node.nodeId === excludedNode) return false;
  if (!['ACTIVE', 'AVAILABLE'].includes(node.state)) return false;
  return node.availability?.status !== 'UNAVAILABLE';
}

function neighbor(current, edge) {
  if (edge.from === current) return edge.to;
  if (edge.to === current) return edge.from;
  return null;
}

function visitComponent(seed, unseen, edges) {
  const queue = [seed];
  let index = 0;
  unseen.delete(seed);
  while (index < queue.length) {
    const current = queue[index];
    index += 1;
    for (const edge of edges) {
      const adjacent = neighbor(current, edge);
      if (adjacent && unseen.delete(adjacent)) queue.push(adjacent);
    }
  }
}

function componentCount(session, excludedNode, excludedEdge) {
  const ids = new Set((session.nodes || []).filter((node) => isActiveNode(node, excludedNode)).map((node) => node.nodeId));
  const edges = (session.edges || []).filter((edge) => edge.edgeId !== excludedEdge && edge.status === 'ACTIVE'
    && ids.has(edge.from) && ids.has(edge.to));
  const unseen = new Set(ids);
  let count = 0;
  while (unseen.size) {
    visitComponent(unseen.values().next().value, unseen, edges);
    count += 1;
  }
  return count;
}

function components(session) {
  return componentCount(session, null, null);
}

module.exports = { components, componentCount };
