'use strict';

function invalid(reason) {
  return { status: 'blocked', reason, nodes: [] };
}

function normalizeNodes(nodes) {
  if (!Array.isArray(nodes)) return null;
  return nodes.map((node) => ({ ...node, dependsOn: [...(node.dependsOn || [])].sort() }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function targetIds(nodes, targets) {
  const ids = targets === undefined ? nodes.filter((node) => node.state === 'open').map((node) => node.id)
    : targets;
  return Array.isArray(ids) && ids.every((id) => typeof id === 'string') ? ids : null;
}

function slice(input = {}) {
  const nodes = normalizeNodes(input.nodes);
  if (!nodes) return invalid('slice_nodes_invalid');
  const selectedTargets = targetIds(nodes, input.targets);
  if (!selectedTargets) return invalid('slice_targets_invalid');
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const selected = new Set();
  const queue = [...selectedTargets];
  while (queue.length) {
    const id = queue.pop();
    if (selected.has(id)) continue;
    const node = byId.get(id);
    if (!node) return invalid('slice_target_missing');
    selected.add(id);
    queue.push(...node.dependsOn);
  }
  const result = nodes.filter((node) => selected.has(node.id));
  return { status: 'ready', targets: selectedTargets.sort(), nodes: result,
    omitted: nodes.filter((node) => !selected.has(node.id)).map((node) => node.id) };
}

module.exports = { slice };
