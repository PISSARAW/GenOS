'use strict';

const { randomUUID } = require('crypto');
const { validateExpression } = require('./morphologyExpressionSchema');

const EXPRESSION_VERSION = 1;
const BASE_FIELDS = ['scope', 'mission', 'budget', 'metadata'];

function baseOptions(options = {}) { return { scope: options.scope, mission: options.mission, budget: options.budget, metadata: options.metadata }; }

function createExpression(input = {}) {
  const expression = buildExpressionObject(input);
  const validation = validateExpression(expression);
  if (!validation.valid) throw new Error(`Invalid morphology expression: ${validation.errors.join('; ')}`);
  return expression;
}

function coreFields(input) {
  return { expressionId: input.expressionId || randomUUID(), version: EXPRESSION_VERSION, kind: input.kind };
}

function topologyFields(input) {
  return { topology: input.topology || null, variant: input.variant || null, nodeKind: input.nodeKind || null };
}

function nestFields(input) { return { host: input.host || null, inner: input.inner || null }; }
function conditionFields(input) { return { condition: input.condition || null, thenBranch: input.thenBranch || null, elseBranch: input.elseBranch || null }; }
function wrapFields(input) { return { environment: input.environment || null }; }
function bridgeFields(input) { return { source: input.source || null, target: input.target || null, adapter: input.adapter || null }; }
function federateFields(input) { return { members: Array.isArray(input.members) ? [...input.members] : [], quorum: input.quorum || null }; }
function parallelFields(input) { return { children: Array.isArray(input.children) ? [...input.children] : [] }; }
function portsField(input) { return { ports: Array.isArray(input.ports) ? [...input.ports] : [] }; }

function buildExpressionObject(input) {
  return { ...coreFields(input), ...topologyFields(input), ...nestFields(input), ...conditionFields(input), ...wrapFields(input), ...bridgeFields(input), ...federateFields(input), ...parallelFields(input), ...portsField(input), ...baseOptions(input) };
}

function applyRequired(expr, spec, options) {
  if (!spec.required) return;
  for (const k of spec.required) expr[k] = options[k];
}

function applyOptional(expr, spec, options) {
  if (!spec.optional) return;
  for (const k of spec.optional) if (options[k] !== undefined) expr[k] = options[k];
}

function applySpec(spec, options) {
  const expr = { kind: spec.kind, nodeKind: spec.nodeKind, ...baseOptions(options) };
  applyRequired(expr, spec, options);
  applyOptional(expr, spec, options);
  return createExpression(expr);
}

const EXPRESSION_SPECS = {
  TOPOLOGY: { kind: 'TOPOLOGY', nodeKind: 'TOPOLOGY', required: ['topology'], optional: ['variant', 'ports'] },
  NEST: { kind: 'NEST', nodeKind: 'OPERATOR', required: ['host', 'inner'], optional: BASE_FIELDS },
  PARALLEL: { kind: 'PARALLEL', nodeKind: 'OPERATOR', required: ['children'], optional: BASE_FIELDS },
  SEQUENCE: { kind: 'SEQUENCE', nodeKind: 'OPERATOR', required: ['children'], optional: BASE_FIELDS },
  GATE: { kind: 'GATE', nodeKind: 'GATE', required: ['condition', 'thenBranch', 'elseBranch'], optional: BASE_FIELDS },
  COMPETE: { kind: 'COMPETE', nodeKind: 'OPERATOR', required: ['children'], optional: BASE_FIELDS },
  WRAP: { kind: 'WRAP', nodeKind: 'ENVIRONMENT', required: ['inner', 'environment'], optional: BASE_FIELDS },
  BRIDGE: { kind: 'BRIDGE', nodeKind: 'ADAPTER', required: ['source', 'target', 'adapter'], optional: BASE_FIELDS },
  FEDERATE: { kind: 'FEDERATE', nodeKind: 'OPERATOR', required: ['members', 'quorum'], optional: BASE_FIELDS }
};

function topologyExpression(topology, variant = null, options = {}) {
  return applySpec(EXPRESSION_SPECS.TOPOLOGY, { topology, variant, ...options });
}

function nestExpression(host, inner, options = {}) {
  return applySpec(EXPRESSION_SPECS.NEST, { host: ensureExpression(host), inner: ensureExpression(inner), ...options });
}

function parallelExpression(children, options = {}) {
  return applySpec(EXPRESSION_SPECS.PARALLEL, { children: children.map(ensureExpression), ...options });
}

function sequenceExpression(children, options = {}) {
  return applySpec(EXPRESSION_SPECS.SEQUENCE, { children: children.map(ensureExpression), ...options });
}

function gateExpression(opts) {
  return applySpec(EXPRESSION_SPECS.GATE, { condition: ensureExpression(opts.condition), thenBranch: ensureExpression(opts.thenBranch), elseBranch: ensureExpression(opts.elseBranch), ...opts });
}

function competeExpression(children, options = {}) {
  return applySpec(EXPRESSION_SPECS.COMPETE, { children: children.map(ensureExpression), ...options });
}

function wrapExpression(inner, environment, options = {}) {
  return applySpec(EXPRESSION_SPECS.WRAP, { inner: ensureExpression(inner), environment: normalizeEnv(environment), ...options });
}

function bridgeExpression(opts) {
  return applySpec(EXPRESSION_SPECS.BRIDGE, { source: ensureExpression(opts.source), target: ensureExpression(opts.target), adapter: normalizeAdapter(opts.adapter), ...opts });
}

function federateExpression(members, options = {}) {
  return applySpec(EXPRESSION_SPECS.FEDERATE, { members: members.map(ensureExpression), quorum: options.quorum || Math.ceil(members.length / 2), ...options });
}

function normalizeEnv(env) { return typeof env === 'string' ? { name: env } : env; }
function normalizeAdapter(adapter) { return typeof adapter === 'string' ? { name: adapter } : adapter; }

function ensureExpression(expr) {
  if (!expr) throw new Error('Expression cannot be null or undefined');
  if (expr.expressionId) return expr;
  if (expr.kind) return createExpression(expr);
  throw new Error('Invalid expression: must be an expression object or have a kind field');
}

function cloneExpression(expr) { return JSON.parse(JSON.stringify(expr)); }

function expressionToSummary(expr) {
  if (!expr) return null;
  const summary = { kind: expr.kind };
  const handlers = {
    TOPOLOGY: () => { summary.topology = expr.topology; summary.variant = expr.variant; },
    NEST: () => { summary.host = expressionToSummary(expr.host); summary.inner = expressionToSummary(expr.inner); },
    GATE: () => { summary.condition = expressionToSummary(expr.condition); summary.thenBranch = expressionToSummary(expr.thenBranch); summary.elseBranch = expressionToSummary(expr.elseBranch); },
    WRAP: () => { summary.inner = expressionToSummary(expr.inner); summary.environment = expr.environment; },
    BRIDGE: () => { summary.source = expressionToSummary(expr.source); summary.target = expressionToSummary(expr.target); summary.adapter = expr.adapter; },
    FEDERATE: () => { summary.members = expr.members.map(expressionToSummary); summary.quorum = expr.quorum; }
  };
  if (handlers[expr.kind]) handlers[expr.kind]();
  else if (Array.isArray(expr.children)) summary.children = expr.children.map(expressionToSummary);
  return summary;
}

function collectTopologies(expr, result = []) {
  if (!expr) return result;
  if (expr.kind === 'TOPOLOGY') result.push({ topology: expr.topology, variant: expr.variant });
  else if (expr.kind === 'NEST') { collectTopologies(expr.host, result); collectTopologies(expr.inner, result); }
  else if (expr.kind === 'GATE') { collectTopologies(expr.condition, result); collectTopologies(expr.thenBranch, result); collectTopologies(expr.elseBranch, result); }
  else if (expr.kind === 'WRAP') collectTopologies(expr.inner, result);
  else if (expr.kind === 'BRIDGE') { collectTopologies(expr.source, result); collectTopologies(expr.target, result); }
  else if (expr.kind === 'FEDERATE') expr.members.forEach(m => collectTopologies(m, result));
  else if (Array.isArray(expr.children)) expr.children.forEach(c => collectTopologies(c, result));
  return result;
}

function countNodes(expr) {
  if (!expr) return 0;
  let count = 1;
  const handlers = {
    NEST: () => { count += countNodes(expr.host) + countNodes(expr.inner); },
    GATE: () => { count += countNodes(expr.condition) + countNodes(expr.thenBranch) + countNodes(expr.elseBranch); },
    WRAP: () => { count += countNodes(expr.inner); },
    BRIDGE: () => { count += countNodes(expr.source) + countNodes(expr.target); },
    FEDERATE: () => { expr.members.forEach(m => { count += countNodes(m); }); }
  };
  if (handlers[expr.kind]) handlers[expr.kind]();
  else if (Array.isArray(expr.children)) expr.children.forEach(c => { count += countNodes(c); });
  return count;
}

module.exports = { EXPRESSION_VERSION, createExpression, topologyExpression, nestExpression, parallelExpression, sequenceExpression, gateExpression, competeExpression, wrapExpression, bridgeExpression, federateExpression, ensureExpression, cloneExpression, expressionToSummary, collectTopologies, countNodes };