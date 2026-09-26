'use strict';

function checkBudgets(input) {
  const errors = [];
  if (!input || !input.graph) return { valid: false, errors: ['graph is required'] };
  const graph = input.graph;
  const root = graph.nodes.find((node) => node.nodeId === graph.rootNodeId);
  if (!root) return { valid: false, errors: ['root node missing'] };
  checkNodeBudget(graph, root, errors);
  return { valid: errors.length === 0, errors };
}

function checkNodeBudget(graph, node, errors) {
  const children = childNodes(graph, node);
  if (children.length === 0) return;
  checkSumWithinParent(node, children, errors);
  for (const child of children) checkNodeBudget(graph, child, errors);
}

function childNodes(graph, node) {
  if (Array.isArray(node.children) && node.children.length > 0) {
    return node.children.map((id) => graph.nodes.find((n) => n.nodeId === id)).filter(Boolean);
  }
  return graph.nodes.filter((child) => child.parentNodeId === node.nodeId);
}

function checkSumWithinParent(node, children, errors) {
  const keys = numericKeys(node, children);
  for (const key of keys) checkKeyWithinParent(node, children, key, errors);
}

function numericKeys(node, children) {
  const keys = new Set(Object.keys(node.budget || {}));
  for (const child of children) {
    for (const key of Object.keys(child.budget || {})) keys.add(key);
  }
  return Array.from(keys);
}

function checkKeyWithinParent(node, children, key, errors) {
  const parentValue = node.budget && node.budget[key];
  if (!Number.isFinite(parentValue)) return;
  const sum = sumChildren(children, key);
  if (sum - parentValue > 1e-9) {
    errors.push(`budget ${key} of ${node.nodeId} exceeded: children sum ${sum} > ${parentValue}`);
  }
}

function sumChildren(children, key) {
  return children.reduce((sum, child) => {
    const value = child.budget && child.budget[key];
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

module.exports = { checkBudgets };
