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
  const { nodeId, kind, output, budget } = opts;
  return {
    recordType: 'execution_receipt',
    verificationStatus: 'not_verified',
    receiptId: randomUUID(),
    nodeId,
    kind,
    output,
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
  const authority = Array.isArray(context.authority) ? context.authority : [];
  if (authority.includes('*')) return [...boundary];
  return authority.filter(a => boundary.includes(a));
}

function cloneInput(value, seen = new WeakMap()) {
  if (!value || typeof value !== 'object') return value;
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return value;
  if (seen.has(value)) return seen.get(value);
  const copy = Array.isArray(value) ? [] : {};
  seen.set(value, copy);
  for (const [key, item] of Object.entries(value)) copy[key] = cloneInput(item, seen);
  return copy;
}

function intersectBudgets(parent, requested) {
  const result = { ...parent, ...requested };
  for (const [key, limit] of Object.entries(parent)) {
    if (Number.isFinite(limit) && Number.isFinite(requested[key])) result[key] = Math.min(limit, requested[key]);
    if (limit && typeof limit === 'object') result[key] = intersectBudgets(limit, requested[key] || {});
  }
  return result;
}

function createChildContext(parentContext, node, options = {}) {
  const { isolated = true, budgetFraction = 1 } = options;
  return createExecutionContext({
    missionId: parentContext.missionId,
    graphId: parentContext.graphId,
    nodeId: node.nodeId,
    parentExecutionId: parentContext.executionId,
    capabilityDb: parentContext.capabilityDb,
    statisticalContracts: parentContext.statisticalContracts,
    budget: allocateBudget(parentContext.budget, budgetFraction),
    authority: applyAuthorityBoundary(parentContext, node.authorityBoundary),
    state: isolated ? structuredClone({ ...parentContext.state, ...node.state }) : parentContext.state,
    evidence: [],
    input: cloneInput(parentContext.output !== null && parentContext.output !== undefined ? parentContext.output : parentContext.input)
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
  createChildContext,
  intersectBudgets
};
