'use strict';

const { randomUUID } = require('crypto');

function createExecutionContext(input = {}) {
  const base = {
    executionId: randomUUID(),
    missionId: null,
    graphId: null,
    nodeId: null,
    parentExecutionId: null,
    budget: {},
    authority: [],
    state: {},
    evidence: [],
    input: null,
    output: null,
    receipts: [],
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: 'running',
    error: null
  };
  return { ...base, ...input };
}

function createReceipt(opts) {
  const { nodeId, kind, output, evidence, budget } = opts;
  return {
    receiptId: randomUUID(),
    nodeId,
    kind,
    output,
    evidence: evidence || [],
    budget: budget || {},
    timestamp: new Date().toISOString()
  };
}

function cloneBudget(budget) {
  return JSON.parse(JSON.stringify(budget || {}));
}

function allocateBudget(budget, fraction) {
  if (!budget || typeof budget !== 'object') return {};
  const allocated = {};
  for (const [key, value] of Object.entries(budget)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      allocated[key] = value * fraction;
    } else if (value && typeof value === 'object') {
      allocated[key] = allocateBudget(value, fraction);
    }
  }
  return allocated;
}

function mergeBudgets(...budgets) {
  const merged = {};
  for (const budget of budgets) {
    if (!budget) continue;
    mergeInto(merged, budget);
  }
  return merged;
}

function mergeInto(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      target[key] = (target[key] || 0) + value;
    } else if (value && typeof value === 'object') {
      target[key] = mergeBudgets(target[key], value);
    }
  }
}

function checkBudgetExhausted(context) {
  if (!context.budget) return false;
  return Object.values(context.budget).some(isExhausted);
}

function isExhausted(value) {
  if (typeof value === 'number' && value <= 0) return true;
  if (value && typeof value === 'object') return Object.values(value).some(isExhausted);
  return false;
}

function applyAuthorityBoundary(context, boundary) {
  if (!boundary || !Array.isArray(boundary)) return context.authority;
  return context.authority.filter(a => boundary.includes(a));
}

function createChildContext(parentContext, node, options = {}) {
  const { isolated = true, budgetFraction = 1 } = options;
  return createExecutionContext({
    missionId: parentContext.missionId,
    graphId: parentContext.graphId,
    nodeId: node.nodeId,
    parentExecutionId: parentContext.executionId,
    budget: allocateBudget(parentContext.budget, budgetFraction),
    authority: applyAuthorityBoundary(parentContext, node.authorityBoundary),
    state: isolated ? { ...parentContext.state } : parentContext.state,
    evidence: [...parentContext.evidence],
    input: parentContext.output !== null && parentContext.output !== undefined ? parentContext.output : parentContext.input
  });
}

module.exports = {
  createExecutionContext,
  createReceipt,
  cloneBudget,
  allocateBudget,
  mergeBudgets,
  checkBudgetExhausted,
  applyAuthorityBoundary,
  createChildContext
};