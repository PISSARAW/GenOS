'use strict';
const { randomUUID } = require('node:crypto');
const { distributeWorkers, mergedWorkers } = require('./patchWorkerOperations');
const { mergeBudgets } = require('../runtime/operators/executionContext');

function node(graph, id) {
  const value = graph.nodes.find(item => item.nodeId === id);
  if (!value) throw new Error('Unknown patch node: ' + id);
  return value;
}
function edge(graph, id) {
  const value = graph.edges.find(item => item.edgeId === id);
  if (!value) throw new Error('Unknown patch edge: ' + id);
  return value;
}
function nonEmpty(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(label + ' is required');
  return value;
}
function addNode(graph, input) {
  if (!input || typeof input !== 'object') throw new Error('ADD_NODE requires a node');
  const value = structuredClone(input);
  value.nodeId = value.nodeId || randomUUID();
  if (graph.nodes.some(item => item.nodeId === value.nodeId)) throw new Error('Duplicate patch node: ' + value.nodeId);
  if (value.parentNodeId) node(graph, value.parentNodeId);
  graph.nodes.push(value);
  if (value.parentNodeId) attach(graph, value.nodeId, value.parentNodeId);
  return value;
}
function addEdge(graph, input) {
  if (!input) throw new Error('ADD_EDGE requires an edge');
  const value = { ...structuredClone(input), edgeId: input.edgeId || randomUUID() };
  node(graph, value.fromNodeId); node(graph, value.toNodeId);
  if (value.fromNodeId === value.toNodeId) throw new Error('Patch edge cannot reference itself');
  if (graph.edges.some(item => item.edgeId === value.edgeId)) throw new Error('Duplicate patch edge: ' + value.edgeId);
  graph.edges.push(value);
  return value;
}
function detach(graph, childId) {
  const child = node(graph, childId);
  if (child.parentNodeId) {
    const parent = node(graph, child.parentNodeId);
    parent.children = (parent.children || []).filter(id => id !== childId);
  }
  graph.edges = graph.edges.filter(item => !(item.type === 'CONTAINS' && item.toNodeId === childId));
  child.parentNodeId = null;
}
function attach(graph, childId, parentId) {
  const child = node(graph, childId);
  const parent = node(graph, parentId);
  if (childId === graph.rootNodeId) throw new Error('Cannot reparent the graph root');
  assertNoCycle(graph, childId, parentId);
  detach(graph, childId);
  child.parentNodeId = parentId;
  parent.children = [...new Set([...(parent.children || []), childId])];
  addEdge(graph, { type: 'CONTAINS', fromNodeId: parentId, toNodeId: childId });
}
function assertNoCycle(graph, childId, parentId) {
  const visited = new Set([childId]);
  let current = parentId;
  while (current) {
    if (visited.has(current)) throw new Error('Patch would create a containment cycle');
    visited.add(current);
    current = node(graph, current).parentNodeId;
  }
}
function removeNode(graph, op) {
  const target = node(graph, op.nodeId);
  const children = graph.nodes.filter(item => item.parentNodeId === target.nodeId);
  if (children.length) throw new Error('REMOVE_NODE requires child migration first');
  if (target.nodeId === graph.rootNodeId) throw new Error('Cannot remove the graph root');
  detach(graph, target.nodeId);
  graph.nodes = graph.nodes.filter(item => item.nodeId !== target.nodeId);
  graph.edges = graph.edges.filter(item => item.fromNodeId !== target.nodeId && item.toNodeId !== target.nodeId);
}
function replaceNode(graph, op) {
  const target = node(graph, op.nodeId);
  if (!op.newNode) throw new Error('REPLACE_NODE requires newNode');
  if (op.newNode.parentNodeId !== undefined && op.newNode.parentNodeId !== target.parentNodeId) {
    throw new Error('REPLACE_NODE cannot reparent; use MOVE_SUBTREE');
  }
  Object.assign(target, structuredClone(op.newNode), { nodeId: target.nodeId });
}
function split(graph, op) {
  const target = node(graph, op.nodeId);
  if (!Array.isArray(op.splitResult) || op.splitResult.length < 2) throw new Error('SPLIT requires at least two child nodes');
  if (graph.nodes.some(item => item.parentNodeId === target.nodeId)) throw new Error('SPLIT requires child migration first');
  const children = op.splitResult.map(item => addNode(graph, { ...item, parentNodeId: null }));
  distributeWorkers(target, children);
  target.kind = 'OPERATOR'; target.operator = op.operator || 'PARALLEL';
  target.topology = null; target.variant = null; target.children = [];
  for (const child of children) attach(graph, child.nodeId, target.nodeId);
}
function merge(graph, op) {
  if (!Array.isArray(op.nodeIds) || op.nodeIds.length < 2 || new Set(op.nodeIds).size !== op.nodeIds.length) throw new Error('MERGE requires distinct nodes');
  const sources = op.nodeIds.map(id => node(graph, id));
  const parentId = sources[0].parentNodeId;
  if (!parentId || sources.some(item => item.parentNodeId !== parentId)) throw new Error('MERGE requires sibling nodes');
  const replacement = addNode(graph, { ...sources[0], ...op.mergedNode,
    nodeId: op.mergedNode?.nodeId || randomUUID(), parentNodeId: null, children: [],
    workers: mergedWorkers(sources), state: mergedState(sources, op), budget: mergedBudget(sources, op) });
  const ids = new Set(op.nodeIds);
  const children = graph.nodes.filter(item => ids.has(item.parentNodeId));
  for (const child of children) attach(graph, child.nodeId, replacement.nodeId);
  const external = graph.edges.filter(item => item.type !== 'CONTAINS');
  graph.edges = graph.edges.filter(item => item.type === 'CONTAINS');
  for (const item of external) remapEdge(graph, item, { ids, replacement });
  for (const source of sources) removeNode(graph, { nodeId: source.nodeId });
  attach(graph, replacement.nodeId, parentId);
}
function mergedState(sources, op) {
  if (op.mergedNode?.state) return structuredClone(op.mergedNode.state);
  const result = {};
  for (const source of sources) mergeFields(result, source.state || {});
  return result;
}
function mergeFields(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (Object.hasOwn(target, key) && JSON.stringify(target[key]) !== JSON.stringify(value)) {
      throw new Error('MERGE requires explicit state conflict resolution for ' + key);
    }
    target[key] = structuredClone(value);
  }
}
function mergedBudget(sources, op) {
  if (op.mergedNode?.budget) return structuredClone(op.mergedNode.budget);
  return mergeBudgets(...sources.map(source => source.budget || {}));
}
function remapEdge(graph, input, context) {
  const value = { ...input };
  if (context.ids.has(value.fromNodeId)) value.fromNodeId = context.replacement.nodeId;
  if (context.ids.has(value.toNodeId)) value.toNodeId = context.replacement.nodeId;
  if (value.fromNodeId !== value.toNodeId) graph.edges.push(value);
}
module.exports = { node, edge, nonEmpty, addNode, addEdge, attach, detach, removeNode, replaceNode, split, merge };
