'use strict';

function planSubtreeRetirement(graph, rootId) {
  const nodes = Array.isArray(graph && graph.nodes) ? graph.nodes : [];
  if (!rootId || !nodes.some((node) => node.id === rootId)) throw new Error('subtree root must exist');
  const children = new Map();
  for (const node of nodes) {
    const siblings = children.get(node.parentNodeId) || [];
    siblings.push(node.id);
    children.set(node.parentNodeId, siblings);
  }
  const ordered = [];
  const pending = [rootId];
  while (pending.length) {
    const current = pending.pop();
    ordered.push(current);
    pending.push(...(children.get(current) || []));
  }
  return { nodeIds: [...new Set(ordered)], preserveEvidence: true, requiresPromotionGate: true };
}

module.exports = { planSubtreeRetirement };
