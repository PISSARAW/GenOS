'use strict';

const { randomUUID } = require('crypto');

function addNodeMutation(expr, m) {
  if (!expr.children) expr.children = [];
  expr.children.push({ kind: 'TOPOLOGY', topology: m.topology || 'trinity', variant: m.variant, nodeId: m.nodeId || randomUUID() });
  return expr;
}

function removeNodeMutation(expr, m) {
  if (!expr.children) return expr;
  expr.children = expr.children.filter(c => c.nodeId !== m.nodeId);
  return expr;
}

function replaceNodeMutation(expr, m) {
  if (!expr.children) return expr;
  const idx = expr.children.findIndex(c => c.nodeId === m.nodeId);
  if (idx >= 0) expr.children[idx] = { ...expr.children[idx], topology: m.newTopology, variant: m.newVariant };
  return expr;
}

function nestMutation(expr, m) {
  const host = expr.children?.find(c => c.nodeId === m.hostId);
  const inner = expr.children?.find(c => c.nodeId === m.innerId);
  if (!host || !inner) return expr;
  return { kind: 'NEST', host: { ...host, children: [inner] }, inner, nodeId: m.nodeId || randomUUID() };
}

function unnestMutation(expr, m) {
  if (expr.kind !== 'NEST') return expr;
  return { kind: 'PARALLEL', children: [expr.host, expr.inner], nodeId: m.nodeId || randomUUID() };
}

function splitMutation(expr, m) {
  if (!expr.children) return expr;
  const mid = Math.ceil(expr.children.length / 2);
  return { kind: 'PARALLEL', children: [ { kind: 'PARALLEL', children: expr.children.slice(0, mid) }, { kind: 'PARALLEL', children: expr.children.slice(mid) } ], nodeId: m.nodeId || randomUUID() };
}

function mergeMutation(expr, m) {
  if (!expr.children) return expr;
  const merged = expr.children.flatMap(c => c.children || [c]);
  return { kind: 'PARALLEL', children: merged, nodeId: m.nodeId || randomUUID() };
}

function moveSubtreeMutation(expr, m) {
  if (!expr.children) return expr;
  const child = expr.children.find(c => c.nodeId === m.nodeId);
  if (!child) return expr;
  const without = expr.children.filter(c => c.nodeId !== m.nodeId);
  const target = without.find(c => c.nodeId === m.newParentId);
  if (target) { if (!target.children) target.children = []; target.children.push(child); }
  return { ...expr, children: without };
}

function changeTopologyMutation(expr, m) {
  if (expr.kind !== 'TOPOLOGY') return expr;
  return { ...expr, topology: m.newTopology, variant: m.newVariant || expr.variant };
}

function changeVariantMutation(expr, m) {
  if (expr.kind !== 'TOPOLOGY') return expr;
  return { ...expr, variant: m.newVariant };
}

function resizePopulationMutation(expr, m) {
  return { ...expr, populationSize: m.newSize };
}

function addEdgeMutation(expr, m) {
  if (!expr.edges) expr.edges = [];
  expr.edges.push({ from: m.fromNodeId, to: m.toNodeId, type: m.type });
  return expr;
}

function removeEdgeMutation(expr, m) {
  if (!expr.edges) return expr;
  expr.edges = expr.edges.filter(e => e.from !== m.fromNodeId || e.to !== m.toNodeId);
  return expr;
}

function rewireMutation(expr, m) {
  if (!expr.edges) return expr;
  const edge = expr.edges.find(e => e.from === m.fromNodeId && e.to === m.toNodeId);
  if (edge) { edge.from = m.newFrom || edge.from; edge.to = m.newTo || edge.to; }
  return expr;
}

function addBridgeMutation(expr, m) {
  if (!expr.bridges) expr.bridges = [];
  expr.bridges.push({ from: m.fromNodeId, to: m.toNodeId, adapter: m.adapter });
  return expr;
}

function removeBridgeMutation(expr, m) {
  if (!expr.bridges) return expr;
  expr.bridges = expr.bridges.filter(b => b.from !== m.fromNodeId || b.to !== m.toNodeId);
  return expr;
}

function migrateWorkerMutation(expr, m) { return expr; }
function migrateStateMutation(expr, m) { return expr; }

function changeBudgetMutation(expr, m) { return { ...expr, budget: { ...expr.budget, ...m.budgetDelta } }; }
function changeCommPolicyMutation(expr, m) { return { ...expr, communicationPolicy: m.newPolicy }; }
function changeEvidencePolicyMutation(expr, m) { return { ...expr, evidencePolicy: m.newPolicy }; }

function freezeMutation(expr, m) { return { ...expr, lifecycle: 'frozen' }; }
function thawMutation(expr, m) { return { ...expr, lifecycle: 'active' }; }
function quiesceMutation(expr, m) { return { ...expr, lifecycle: 'quiesced' }; }
function promoteMutation(expr, m) { return { ...expr, authorityBoundary: m.newAuthorityBoundary }; }
function demoteMutation(expr, m) { return { ...expr, authorityBoundary: m.newAuthorityBoundary }; }

const MUTATION_HANDLERS = {
  ADD_NODE: addNodeMutation, REMOVE_NODE: removeNodeMutation, REPLACE_NODE: replaceNodeMutation,
  NEST: nestMutation, UNNEST: unnestMutation, SPLIT: splitMutation, MERGE: mergeMutation,
  MOVE_SUBTREE: moveSubtreeMutation, CHANGE_TOPOLOGY: changeTopologyMutation, CHANGE_VARIANT: changeVariantMutation,
  RESIZE_POPULATION: resizePopulationMutation, ADD_EDGE: addEdgeMutation, REMOVE_EDGE: removeEdgeMutation,
  REWIRE: rewireMutation, ADD_BRIDGE: addBridgeMutation, REMOVE_BRIDGE: removeBridgeMutation,
  MIGRATE_WORKER: migrateWorkerMutation, MIGRATE_STATE: migrateStateMutation,
  CHANGE_BUDGET: changeBudgetMutation, CHANGE_COMMUNICATION_POLICY: changeCommPolicyMutation,
  CHANGE_EVIDENCE_POLICY: changeEvidencePolicyMutation, FREEZE: freezeMutation, THAW: thawMutation,
  QUIESCE: quiesceMutation, PROMOTE: promoteMutation, DEMOTE: demoteMutation
};

function applySingleMutation(expr, mutation) {
  const handler = MUTATION_HANDLERS[mutation.type];
  return handler ? handler(expr, mutation) : expr;
}

function applyMutations(seedExpression, mutations) {
  let expr = JSON.parse(JSON.stringify(seedExpression));
  for (const mutation of mutations) expr = applySingleMutation(expr, mutation);
  return expr;
}

module.exports = { MUTATION_HANDLERS, applyMutations, applySingleMutation };