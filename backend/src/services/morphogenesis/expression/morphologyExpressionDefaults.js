'use strict';

const { cloneExpression } = require('./morphologyExpression');

function annotateWithDefaults(expr, defaults = {}) {
  const annotated = cloneExpression(expr);

  function applyDefaults(node) {
    if (!node) return node;
    if (!node.scope) node.scope = defaults.scope || 'mission';
    if (!node.mission) node.mission = defaults.mission || null;
    if (!node.budget || Object.keys(node.budget).length === 0) node.budget = { ...defaults.budget };

    const handlers = {
      NEST: () => { applyDefaults(node.host); applyDefaults(node.inner); },
      GATE: () => { applyDefaults(node.condition); applyDefaults(node.thenBranch); applyDefaults(node.elseBranch); },
      WRAP: () => { applyDefaults(node.inner); },
      BRIDGE: () => { applyDefaults(node.source); applyDefaults(node.target); },
      FEDERATE: () => { node.members?.forEach(applyDefaults); }
    };

    if (handlers[node.kind]) handlers[node.kind]();
    else if (Array.isArray(node.children)) node.children.forEach(applyDefaults);

    return node;
  }

  return applyDefaults(annotated);
}

module.exports = { annotateWithDefaults };