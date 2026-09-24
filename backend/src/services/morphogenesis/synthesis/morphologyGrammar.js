'use strict';

const COMPOSITIONS = Object.freeze([
  'NEST', 'PARALLEL', 'SEQUENCE', 'GATE', 'COMPETE', 'WRAP', 'BRIDGE', 'FEDERATE'
]);
const TERMINALS = Object.freeze(['PRIMITIVE', 'PROCEDURE', 'DIRECT_WORKER']);
const LIMIT_DEFAULTS = Object.freeze({
  maxDepth: 16,
  maxNodes: 128,
  maxWorkers: 32,
  maxParallelBranches: 8
});

function readChildren(expression) {
  if (Array.isArray(expression.children)) return expression.children;
  if (Array.isArray(expression.operands)) return expression.operands;
  return [];
}

function inspectExpression(expression, depth, state) {
  if (!expression || typeof expression !== 'object' || Array.isArray(expression)) {
    state.errors.push('morphology expressions must be objects');
    return;
  }
  state.nodeCount += 1;
  state.maxObservedDepth = Math.max(state.maxObservedDepth, depth);
  const kind = expression.kind;
  if (TERMINALS.includes(kind)) inspectTerminal(expression, state);
  else if (kind === 'TOPOLOGY') inspectTopology(expression, state);
  else if (COMPOSITIONS.includes(kind)) inspectComposition(expression, state);
  else state.errors.push(`unsupported morphology form: ${kind}`);
  const children = readChildren(expression);
  children.forEach((child) => inspectExpression(child, depth + 1, state));
}

function inspectTerminal(expression, state) {
  if (readChildren(expression).length > 0) state.errors.push(`${expression.kind} cannot have children`);
  const declared = Array.isArray(expression.workers) ? expression.workers.length : 0;
  state.workerCount += expression.kind === 'DIRECT_WORKER' ? Math.max(1, declared) : declared;
}

function inspectTopology(expression, state) {
  if (typeof expression.topology !== 'string' || expression.topology.length === 0) {
    state.errors.push('TOPOLOGY requires a topology name');
  }
  state.workerCount += Array.isArray(expression.workers) ? expression.workers.length : 0;
}

function inspectComposition(expression, state) {
  const children = readChildren(expression);
  const minimum = expression.kind === 'WRAP' ? 1 : 2;
  if (children.length < minimum) state.errors.push(`${expression.kind} requires at least ${minimum} child morphology`);
  if (expression.kind === 'PARALLEL') {
    state.parallelBranchCount = Math.max(state.parallelBranchCount, children.length);
  }
}

function resolvedLimits(limits) {
  const result = { ...LIMIT_DEFAULTS };
  for (const name of Object.keys(result)) {
    if (limits && limits[name] !== undefined) result[name] = limits[name];
  }
  return result;
}

function applyLimits(state, limits) {
  for (const [name, observed] of [
    ['maxDepth', state.maxObservedDepth], ['maxNodes', state.nodeCount],
    ['maxWorkers', state.workerCount], ['maxParallelBranches', state.parallelBranchCount]
  ]) {
    const limit = limits[name];
    if (!Number.isInteger(limit) || limit < 1) state.errors.push(`${name} must be a positive integer`);
    else if (observed > limit) state.errors.push(`${name} exceeded: ${observed} > ${limit}`);
  }
}

function analyzeMorphology(expression, budget = {}) {
  const state = {
    errors: [], nodeCount: 0, workerCount: 0,
    parallelBranchCount: 0, maxObservedDepth: 0
  };
  inspectExpression(expression, 1, state);
  const limits = resolvedLimits(budget);
  applyLimits(state, limits);
  return {
    valid: state.errors.length === 0,
    errors: state.errors,
    usage: {
      nodes: state.nodeCount,
      workers: state.workerCount,
      depth: state.maxObservedDepth,
      parallelBranches: state.parallelBranchCount
    },
    limits
  };
}

module.exports = { COMPOSITIONS, TERMINALS, LIMIT_DEFAULTS, analyzeMorphology };
