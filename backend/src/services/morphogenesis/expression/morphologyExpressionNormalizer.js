'use strict';

const { createExpression, cloneExpression } = require('./morphologyExpression');
const { validateExpression } = require('./morphologyExpressionSchema');
const { flattenExpression } = require('./morphologyExpressionFlattener');
const { annotateWithDefaults } = require('./morphologyExpressionDefaults');

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
  const handlers = {
    NEST: () => { normalized.host = normalizeNode(normalized.host); normalized.inner = normalizeNode(normalized.inner); normalized.nodeKind = 'OPERATOR'; },
    PARALLEL: () => { normalized.children = (normalized.children || []).map(normalizeNode); normalized.nodeKind = 'OPERATOR'; },
    SEQUENCE: () => { normalized.children = (normalized.children || []).map(normalizeNode); normalized.nodeKind = 'OPERATOR'; },
    COMPETE: () => { normalized.children = (normalized.children || []).map(normalizeNode); normalized.nodeKind = 'OPERATOR'; },
    GATE: () => { normalized.condition = normalizeNode(normalized.condition); normalized.thenBranch = normalizeNode(normalized.thenBranch); normalized.elseBranch = normalizeNode(normalized.elseBranch); normalized.nodeKind = 'GATE'; },
    WRAP: () => { normalized.inner = normalizeNode(normalized.inner); normalized.environment = normalizeEnvironment(normalized.environment); normalized.nodeKind = 'ENVIRONMENT'; },
    BRIDGE: () => { normalized.source = normalizeNode(normalized.source); normalized.target = normalizeNode(normalized.target); normalized.adapter = normalizeAdapter(normalized.adapter); normalized.nodeKind = 'ADAPTER'; },
    FEDERATE: () => { normalized.members = (normalized.members || []).map(normalizeNode); normalized.quorum = normalized.quorum ?? Math.ceil((normalized.members?.length || 2) / 2); normalized.nodeKind = 'OPERATOR'; }
  };
  if (handlers[normalized.kind]) handlers[normalized.kind]();
  if (normalized.budget) normalized.budget = normalizeBudget(normalized.budget);
  return createExpression(normalized);
}

function normalizePort(port) {
  if (!port || typeof port !== 'object') return port;
  return { ...port, portId: port.portId || `port_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, name: String(port.name || '').trim(), type: String(port.type || 'INPUT').toUpperCase(), direction: String(port.direction || 'in').toLowerCase(), schema: port.schema || {}, required: port.required === true };
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