'use strict';

const { cloneExpression } = require('./morphologyExpression');

function annotateWithDefaults(expr, defaults = {}) {
  const annotated = cloneExpression(expr);

  function applyDefaults(node, parentBudget) {
    if (!node) return node;
    if (!node.scope) node.scope = defaults.scope || 'mission';
    if (!node.mission) node.mission = defaults.mission || null;
    applyBudget(node, parentBudget, defaults);
    const childBudget = hasBudget(node) ? node.budget : parentBudget;
    applyToChildren(node, childBudget);
    return node;
  }

  function applyToChildren(node, childBudget) {
    const count = siblingCount(node);
    const share = divideBudget(childBudget, count);
    eachChild(node, (child) => applyDefaults(child, share));
  }

  return applyDefaults(annotated, null);
}

function hasBudget(node) {
  return node.budget && Object.keys(node.budget).length > 0;
}

function applyBudget(node, parentBudget, defaults) {
  if (hasBudget(node)) return;
  if (parentBudget) node.budget = { ...parentBudget };
  else node.budget = { ...defaults.budget };
}

function siblingCount(node) {
  if (node.kind === 'NEST') return 2;
  if (node.kind === 'GATE') return 3;
  if (node.kind === 'WRAP') return 1;
  if (node.kind === 'BRIDGE') return 2;
  if (node.kind === 'FEDERATE' && Array.isArray(node.members)) return node.members.length;
  if (Array.isArray(node.children) && node.children.length > 0) return node.children.length;
  if (Array.isArray(node.members) && node.members.length > 0) return node.members.length;
  return 0;
}

function eachChild(node, visit) {
  if (node.kind === 'NEST') { visit(node.host); visit(node.inner); return; }
  if (node.kind === 'GATE') { visit(node.condition); visit(node.thenBranch); visit(node.elseBranch); return; }
  if (node.kind === 'WRAP') { visit(node.inner); return; }
  if (node.kind === 'BRIDGE') { visit(node.source); visit(node.target); return; }
  if (node.kind === 'FEDERATE' && Array.isArray(node.members)) { node.members.forEach(visit); return; }
  if (Array.isArray(node.children)) node.children.forEach(visit);
}

function divideBudget(budget, count) {
  if (!budget || !count || count <= 1) return budget;
  const share = {};
  for (const key of Object.keys(budget)) share[key] = budget[key];
  for (const key of Object.keys(share)) {
    if (Number.isFinite(share[key])) share[key] = share[key] / count;
  }
  return share;
}

module.exports = { annotateWithDefaults };