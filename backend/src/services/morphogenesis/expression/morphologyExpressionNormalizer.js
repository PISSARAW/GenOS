'use strict';

const { createExpression, cloneExpression } = require('./morphologyExpression');
const { validateExpression } = require('./morphologyExpressionSchema');
const { flattenExpression } = require('./morphologyExpressionFlattener');
const { annotateWithDefaults } = require('./morphologyExpressionDefaults');
const crypto = require('crypto');

const OPERATOR_KINDS = ['NEST', 'PARALLEL', 'SEQUENCE', 'COMPETE', 'GATE', 'WRAP', 'BRIDGE', 'FEDERATE'];

function normalizeExpression(expr) {
  if (!expr) throw new Error('Cannot normalize null/undefined expression');
  return normalizeNode(cloneExpression(expr));
}

function normalizeNode(node) {
  if (!node || typeof node !== 'object') return node;
  if (node.kind === 'TOPOLOGY') return normalizeTopology(node);
  if (OPERATOR_KINDS.includes(node.kind)) return normalizeOperator(node);
  return node;
}

function normalizeTopology(node) {
  const normalized = { ...node };
  normalized.topology = String(normalized.topology || '').toLowerCase().trim();
  if (normalized.variant) normalized.variant = String(normalized.variant).toLowerCase().trim();
  normalized.nodeKind = 'TOPOLOGY';
  normalized.kind = 'TOPOLOGY';
  if (normalized.ports) normalized.ports = normalized.ports.map(normalizePort);
  if (normalized.budget) normalized.budget = normalizeBudget(normalized.budget);
  return createExpression(normalized);
}

function normalizeOperator(node) {
  const normalized = { ...node };
  normalized.kind = String(normalized.kind).toUpperCase();
  operatorNormalizer(normalized.kind, normalized);
  if (normalized.budget) normalized.budget = normalizeBudget(normalized.budget);
  return createExpression(normalized);
}

const OPERATOR_NORMALIZERS = {
  NEST: normalizeNestOperator,
  PARALLEL: normalizeChildrenOperator,
  SEQUENCE: normalizeChildrenOperator,
  COMPETE: normalizeChildrenOperator,
  GATE: normalizeGateOperator,
  WRAP: normalizeWrapOperator,
  BRIDGE: normalizeBridgeOperator,
  FEDERATE: normalizeFederateOperator
};

function operatorNormalizer(kind, normalized) {
  const normalize = OPERATOR_NORMALIZERS[kind];
  if (normalize) normalize(normalized);
}

function normalizeNestOperator(node) {
  node.host = normalizeNode(node.host);
  node.inner = normalizeNode(node.inner);
  node.nodeKind = 'OPERATOR';
}

function normalizeChildrenOperator(node) {
  node.children = (node.children || []).map(normalizeNode);
  node.nodeKind = 'OPERATOR';
}

function normalizeGateOperator(node) {
  node.condition = normalizeNode(node.condition);
  node.thenBranch = normalizeNode(node.thenBranch);
  node.elseBranch = normalizeNode(node.elseBranch);
  node.nodeKind = 'GATE';
}

function normalizeWrapOperator(node) {
  node.inner = normalizeNode(node.inner);
  node.environment = normalizeEnvironment(node.environment);
  node.nodeKind = 'ENVIRONMENT';
}

function normalizeBridgeOperator(node) {
  node.source = normalizeNode(node.source);
  node.target = normalizeNode(node.target);
  node.adapter = normalizeAdapter(node.adapter);
  node.nodeKind = 'ADAPTER';
}

function normalizeFederateOperator(node) {
  node.members = (node.members || []).map(normalizeNode);
  node.quorum = node.quorum ?? Math.ceil((node.members?.length || 2) / 2);
  node.nodeKind = 'OPERATOR';
}

function normalizePort(port) {
  if (!port || typeof port !== 'object') return port;
  return { ...port, portId: port.portId || `port_${crypto.randomUUID()}`, name: String(port.name || '').trim(), type: String(port.type || 'INPUT').toUpperCase(), direction: String(port.direction || 'in').toLowerCase(), schema: port.schema || {}, required: port.required === true };
}

function normalizeBudget(budget) {
  if (!budget || typeof budget !== 'object') return {};
  const normalized = {};
  for (const [key, value] of Object.entries(budget)) {
    if (typeof value === 'number' && Number.isFinite(value)) normalized[key] = Math.max(0, value);
    else if (typeof value === 'object' && value !== null) normalized[key] = normalizeBudget(value);
    else normalized[key] = value;
  }
  return normalized;
}

function normalizeEnvironment(env) {
  if (!env) return { name: 'default' };
  if (typeof env === 'string') return { name: env };
  if (typeof env === 'object') return { name: env.name || env.id || 'custom', config: env.config || {}, constraints: env.constraints || {}, secrets: env.secrets || {} };
  return { name: 'default' };
}

function normalizeAdapter(adapter) {
  if (!adapter) throw new Error('BRIDGE requires an adapter');
  if (typeof adapter === 'string') return { name: adapter };
  if (typeof adapter === 'object') return { name: adapter.name || adapter.id || 'custom_adapter', transform: adapter.transform || 'passthrough', contract: adapter.contract || {}, lossEstimate: adapter.lossEstimate || 0 };
  throw new Error('Adapter must be a string or object');
}

function validateAndNormalize(expr) {
  const normalized = normalizeExpression(expr);
  const validation = validateExpression(normalized);
  if (!validation.valid) throw new Error(`Normalized expression invalid: ${validation.errors.join('; ')}`);
  return normalized;
}

module.exports = { normalizeExpression, normalizeNode, normalizeTopology, normalizeOperator, normalizePort, normalizeBudget, normalizeEnvironment, normalizeAdapter, flattenExpression, annotateWithDefaults, validateAndNormalize };
