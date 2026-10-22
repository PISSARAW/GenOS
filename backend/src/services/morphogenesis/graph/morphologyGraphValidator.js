'use strict';

const { EDGE_TYPES } = require('./morphologyEdge');
const { FIREWALL_CONTROLS } = require('../firewalls/firewallTypes');

const DEFAULT_MAX_CHILDREN = 8;
const DEFAULT_MAX_DEPTH = 6;

function validateMorphologyGraph(graph, config = {}) {
  const errors = [];
  const nodes = Array.isArray(graph && graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph && graph.edges) ? graph.edges : [];
  const byId = new Map(nodes.map((node) => [node.nodeId, node]));
  const maxChildren = Number.isInteger(config.maxChildren) ? config.maxChildren : DEFAULT_MAX_CHILDREN;
  const maxDepth = Number.isInteger(config.maxDepth) ? config.maxDepth : DEFAULT_MAX_DEPTH;
  errors.push(...graphIdentityErrors(graph, nodes, byId));
  errors.push(...nodeParentErrors(graph, nodes, byId));
  errors.push(...edgeErrors(edges, byId));
  errors.push(...require('./morphologyContainmentValidation').containmentErrors(nodes, byId));
  const childSets = buildChildSets(nodes, edges);
  errors.push(...maxChildrenErrors(childSets, maxChildren));
  errors.push(...maxDepthErrors(childSets, graph && graph.rootNodeId, maxDepth));
  if (hasContainmentCycle(nodes, edges)) errors.push('containment relationships must be acyclic');
  if (hasAuthorityCycle(edges)) errors.push('authority relationships must be acyclic (DAG)');
  return { valid: errors.length === 0, errors };
}

function graphIdentityErrors(graph, nodes, byId) {
  const errors = [];
  if (!graph || !graph.graphId) errors.push('graphId is required');
  if (!graph || !byId.has(graph.rootNodeId)) errors.push('rootNodeId must reference a node');
  if (byId.size !== nodes.length) errors.push('nodeId values must be unique');
  return errors;
}

function nodeParentErrors(graph, nodes, byId) {
  const errors = [];
  for (const node of nodes) {
    if (node.parentNodeId && !byId.has(node.parentNodeId)) errors.push(`unknown parent for node ${node.nodeId}`);
    if (graph && node.nodeId === graph.rootNodeId && node.parentNodeId) errors.push('root node cannot have a parent');
  }
  return errors;
}

function edgeErrors(edges, byId) {
  const errors = [];
  const edgeIds = new Set();
  for (const edge of edges) {
    if (!EDGE_TYPES.includes(edge.type)) errors.push(`unsupported edge type: ${edge.type}`);
    if (!byId.has(edge.fromNodeId) || !byId.has(edge.toNodeId)) errors.push(`edge ${edge.edgeId} references an unknown node`);
    if (edge.fromNodeId === edge.toNodeId) errors.push(`edge ${edge.edgeId} cannot connect a node to itself`);
    if (edge.type === 'FIREWALL') errors.push(...firewallErrors(edge));
    if (edgeIds.has(edge.edgeId)) errors.push('edgeId values must be unique');
    edgeIds.add(edge.edgeId);
  }
  return errors;
}

function firewallErrors(edge) {
  const controls = edge.properties && edge.properties.controls;
  if (!Array.isArray(controls) || controls.length === 0) return [`firewall ${edge.edgeId} requires controls`];
  return controls.some((control) => !FIREWALL_CONTROLS.includes(control))
    ? [`firewall ${edge.edgeId} declares an unsupported control`]
    : [];
}

function hasContainmentCycle(nodes, edges = []) {
  const parents = new Map();
  for (const node of nodes) {
    if (node.parentNodeId) parents.set(node.nodeId, node.parentNodeId);
  }
  for (const edge of edges) {
    if (edge.type === 'CONTAINS') {
      if (parents.has(edge.toNodeId) && parents.get(edge.toNodeId) !== edge.fromNodeId) return true;
      parents.set(edge.toNodeId, edge.fromNodeId);
    }
  }
  for (const node of nodes) {
    const visited = new Set([node.nodeId]);
    let parent = parents.get(node.nodeId);
    while (parent) {
      if (visited.has(parent)) return true;
      visited.add(parent);
      parent = parents.get(parent);
    }
  }
  return false;
}

function ensureChildSet(childSets, nodeId) {
  let children = childSets.get(nodeId);
  if (!children) {
    children = new Set();
    childSets.set(nodeId, children);
  }
  return children;
}

function buildChildSets(nodes, edges) {
  const childSets = new Map();
  for (const node of nodes) {
    const children = ensureChildSet(childSets, node.nodeId);
    for (const id of Array.isArray(node.children) ? node.children : []) children.add(id);
  }
  for (const node of nodes) {
    if (node.parentNodeId) {
      ensureChildSet(childSets, node.parentNodeId).add(node.nodeId);
    }
  }
  for (const edge of edges) {
    if (edge.type === 'CONTAINS') {
      ensureChildSet(childSets, edge.fromNodeId).add(edge.toNodeId);
    }
  }
  return childSets;
}

function maxChildrenErrors(childSets, maxChildren) {
  const errors = [];
  for (const [nodeId, children] of childSets) {
    if (children.size > maxChildren) errors.push(`node ${nodeId} has too many direct children (${children.size} > ${maxChildren})`);
  }
  return errors;
}

function maxDepthErrors(childSets, rootNodeId, maxDepth) {
  const errors = [];
  const depth = new Map();
  const queue = [];
  if (rootNodeId) {
    depth.set(rootNodeId, 0);
    queue.push(rootNodeId);
  }
  for (let i = 0; i < queue.length; i += 1) {
    const nodeId = queue[i];
    const d = depth.get(nodeId);
    if (d >= maxDepth) errors.push(`node ${nodeId} exceeds MaxDepth (depth ${d} >= ${maxDepth})`);
    const children = childSets.get(nodeId);
    if (children) {
      for (const childId of children) {
        if (!depth.has(childId)) {
          depth.set(childId, d + 1);
          queue.push(childId);
        }
      }
    }
  }
  return errors;
}

function hasAuthorityCycle(edges) {
  const adj = new Map();
  for (const edge of edges) {
    if (edge.type !== 'AUTHORIZES') continue;
    const succ = adj.get(edge.fromNodeId) || new Set();
    succ.add(edge.toNodeId);
    adj.set(edge.fromNodeId, succ);
  }
  const color = new Map();
  for (const start of adj.keys()) {
    if (color.get(start) === 2) continue;
    if (authorityDfs(start, adj, color)) return true;
  }
  return false;
}

function authorityDfs(node, adj, color) {
  color.set(node, 1);
  const succ = adj.get(node);
  if (succ) {
    for (const next of succ) {
      const c = color.get(next);
      if (c === 1) return true;
      if (c === undefined && authorityDfs(next, adj, color)) return true;
    }
  }
  color.set(node, 2);
  return false;
}

module.exports = { validateMorphologyGraph, hasContainmentCycle, hasAuthorityCycle, DEFAULT_MAX_CHILDREN, DEFAULT_MAX_DEPTH };
