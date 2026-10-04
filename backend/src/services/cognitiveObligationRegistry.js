'use strict';

const { createHash } = require('node:crypto');

const VERSION = 1;
const MAX_OBLIGATIONS = 64;
const STATES = new Set(['satisfied', 'enforced', 'open', 'blocked']);
const KINDS = new Set(['INPUT', 'GATE', 'INFER', 'CHECK', 'EMIT']);
const BASIS_KINDS = new Set(['materialized_prompt', 'runtime_flag', 'model_router_limit',
  'check_receipt', 'effect_receipt']);
const NODE_FIELDS = new Set(['id', 'kind', 'state', 'dependsOn', 'basis', 'reason']);

function invalid(reason) {
  return { status: 'blocked', reason, version: VERSION };
}

function identityError(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return 'obligation_invalid';
  if (typeof node.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(node.id)) return 'obligation_id_invalid';
  if (!KINDS.has(node.kind) || !STATES.has(node.state)) return 'obligation_type_invalid';
  if (Object.keys(node).some((key) => !NODE_FIELDS.has(key))) return 'obligation_field_unknown';
  return dependencyError(node);
}

function dependencyError(node) {
  if (!Array.isArray(node.dependsOn) || new Set(node.dependsOn).size !== node.dependsOn.length) {
    return 'obligation_dependencies_invalid';
  }
  return node.dependsOn.every((id) => typeof id === 'string' && /^[a-z][a-z0-9_]*$/.test(id))
    ? null : 'obligation_dependencies_invalid';
}

function basisError(node) {
  if (!node.basis || !BASIS_KINDS.has(node.basis.kind) || typeof node.basis.reference !== 'string') {
    return 'obligation_basis_missing';
  }
  if (Object.keys(node.basis).some((key) => !['kind', 'reference'].includes(key))) return 'obligation_field_unknown';
  if (!node.basis.reference || node.basis.reference.length > 256) return 'obligation_basis_invalid';
  return receiptError(node);
}

function receiptError(node) {
  if (node.kind === 'CHECK' && node.state === 'satisfied' && node.basis.kind !== 'check_receipt') {
    return 'check_receipt_required';
  }
  if (node.kind === 'EMIT' && node.state === 'satisfied' && node.basis.kind !== 'effect_receipt') {
    return 'effect_receipt_required';
  }
  return null;
}

function stateError(node) {
  if (node.state === 'blocked') return typeof node.reason === 'string' && node.reason && !node.basis
    ? null : 'obligation_reason_missing';
  if (node.state === 'open') return node.basis || node.reason ? 'open_obligation_has_basis' : null;
  if (node.reason) return 'obligation_reason_unexpected';
  return basisError(node);
}

function nodeError(node) {
  return identityError(node) || stateError(node);
}

function canonicalNode(item) {
  const node = { id: item.id, kind: item.kind, state: item.state,
    dependsOn: [...item.dependsOn].sort() };
  if (item.basis) node.basis = { kind: item.basis.kind, reference: item.basis.reference };
  if (item.reason) node.reason = item.reason;
  return node;
}

function normalizeNodes(input) {
  if (!Array.isArray(input) || input.length > MAX_OBLIGATIONS) return { error: 'obligation_count_invalid' };
  const ids = new Set();
  const nodes = [];
  for (const item of input) {
    const error = nodeError(item);
    if (error) return { error };
    if (ids.has(item.id)) return { error: 'obligation_id_duplicate' };
    ids.add(item.id);
    nodes.push(canonicalNode(item));
  }
  return { nodes };
}

function orderedNodes(nodes) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const indegree = new Map(nodes.map((node) => [node.id, node.dependsOn.length]));
  const dependents = new Map(nodes.map((node) => [node.id, []]));
  for (const node of nodes) {
    for (const dependency of node.dependsOn) {
      if (!byId.has(dependency)) return { error: 'dependency_missing' };
      dependents.get(dependency).push(node.id);
    }
  }
  const ready = nodes.filter((node) => !node.dependsOn.length).map((node) => node.id).sort();
  const ordered = [];
  while (ready.length) {
    const id = ready.shift();
    ordered.push(byId.get(id));
    for (const dependent of dependents.get(id)) {
      indegree.set(dependent, indegree.get(dependent) - 1);
      if (indegree.get(dependent) === 0) ready.push(dependent);
    }
    ready.sort();
  }
  return ordered.length === nodes.length ? { nodes: ordered } : { error: 'dependency_cycle' };
}

function isSettled(node) {
  return node.state === 'satisfied' || node.state === 'enforced';
}

function hasUnsettledDependency(nodes, byId) {
  return nodes.some((node) => isSettled(node)
    && node.dependsOn.some((id) => !isSettled(byId.get(id))));
}

function planStatus(blocked, residual, runnable) {
  if (blocked.length) return 'blocked';
  if (!residual.length) return 'resolved';
  return runnable.some((node) => node.kind === 'INFER') ? 'ready' : 'deferred';
}

function plan(input) {
  if (input?.version !== VERSION) return invalid('obligation_version_unsupported');
  if (typeof input.operation !== 'string' || !/^[A-Z_]+$/.test(input.operation)) {
    return invalid('obligation_operation_invalid');
  }
  const normalized = normalizeNodes(input.obligations);
  if (normalized.error) return invalid(normalized.error);
  const ordered = orderedNodes(normalized.nodes);
  if (ordered.error) return invalid(ordered.error);
  const byId = new Map(ordered.nodes.map((node) => [node.id, node]));
  const blocked = ordered.nodes.filter((node) => node.state === 'blocked');
  if (!blocked.length && hasUnsettledDependency(ordered.nodes, byId)) {
    return invalid('obligation_dependency_unsettled');
  }
  const residual = ordered.nodes.filter((node) => node.state === 'open');
  const runnable = residual.filter((node) => node.dependsOn.every((id) => isSettled(byId.get(id))));
  const waiting = residual.filter((node) => !runnable.includes(node));
  const digest = createHash('sha256').update(JSON.stringify({ version: VERSION,
    operation: input.operation, obligations: ordered.nodes })).digest('hex');
  const status = planStatus(blocked, residual, runnable);
  return {
    version: VERSION, operation: input.operation, status,
    reason: blocked.length ? 'obligation_blocked' : null,
    obligations: ordered.nodes, residual: residual.map((node) => node.id),
    runnable: runnable.map((node) => node.id), waiting: waiting.map((node) => node.id),
    digest: `sha256:${digest}`
  };
}

module.exports = { VERSION, plan };
