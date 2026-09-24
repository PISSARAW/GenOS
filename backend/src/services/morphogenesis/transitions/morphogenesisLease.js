'use strict';

const { PATCH_OPERATIONS } = require('./morphologyPatch');

const LEASE_ERROR = 'LOCAL_MORPHOGENESIS_AUTHORITY_VIOLATION';

function validateLease(lease) {
  const required = ['nodeId', 'allowedOperators', 'allowedTopologies', 'stateBoundaries', 'authorityCeiling'];
  const missing = required.filter((field) => !lease || !lease[field]);
  const limits = ['maxWorkers', 'maxDepth', 'tokenBudget', 'transitionBudget'];
  const invalid = limits.filter((field) => !Number.isSafeInteger(lease && lease[field]) || lease[field] < 0);
  invalid.push(...emptyLeaseLists(lease));
  if (!lease || !Number.isFinite(lease.expiresAt)) invalid.push('expiresAt');
  return { valid: !missing.length && !invalid.length, errors: [...missing.map((field) => `missing ${field}`), ...invalid.map((field) => `invalid ${field}`)] };
}

function emptyLeaseLists(lease) {
  return ['allowedOperators', 'allowedTopologies', 'stateBoundaries', 'authorityCeiling']
    .filter((field) => Array.isArray(lease && lease[field]) && lease[field].length === 0)
    .map((field) => `empty ${field}`);
}

function graphSubtreeIds(graph, rootId) {
  const nodes = Array.isArray(graph && graph.nodes) ? graph.nodes : [];
  const byParent = new Map();
  for (const node of nodes) {
    const children = byParent.get(node.parentNodeId) || [];
    children.push(node.id);
    byParent.set(node.parentNodeId, children);
  }
  const scope = new Set([rootId]);
  const pending = [rootId];
  while (pending.length) {
    for (const child of byParent.get(pending.pop()) || []) {
      if (!scope.has(child)) { scope.add(child); pending.push(child); }
    }
  }
  return { scope, rootExists: nodes.some((node) => node.id === rootId) };
}

function checkScope(lease, request, graph) {
  const { scope, rootExists } = graphSubtreeIds(graph, lease.nodeId);
  const affected = Array.isArray(request.affectedNodeIds) ? request.affectedNodeIds : [];
  return rootExists && affected.length > 0 && affected.every((nodeId) => scope.has(nodeId));
}

function checkOperations(lease, request) {
  const allowed = new Set(Array.isArray(lease.allowedOperators) ? lease.allowedOperators : []);
  return request.operations.every((operation) => (
    PATCH_OPERATIONS.includes(operation.type) && allowed.has(operation.type)
  ));
}

function checkBounds(lease, request) {
  const fields = ['workerCount', 'depth', 'tokenCost', 'transitionCost'];
  return fields.every((field) => Number.isSafeInteger(request[field]) && request[field] >= 0)
    && request.workerCount <= lease.maxWorkers && request.depth <= lease.maxDepth
    && request.tokenCost <= lease.tokenBudget && request.transitionCost <= lease.transitionBudget;
}

function authorizeLocalMorphogenesis(lease, request = {}) {
  const errors = validateLease(lease).errors;
  errors.push(...authorizationErrors(lease || {}, request));
  return { allowed: errors.length === 0, code: errors.length ? LEASE_ERROR : null, errors };
}

function authorizationErrors(lease, request) {
  const graph = request.graphContext;
  const now = request.now === undefined ? Date.now() : request.now;
  const errors = [];
  if (lease.expiresAt <= now) errors.push('lease expired');
  if (request.globalMutation === true) errors.push('global morphology changes are not delegated');
  if (!request.nodeId || request.nodeId !== lease.nodeId) errors.push('request must remain in the leased subtree');
  if (!Array.isArray(request.operations) || !checkOperations(lease, request)) errors.push('operator is outside the lease');
  if (!checkScope(lease, request, graph)) errors.push('patch references nodes outside the leased subtree');
  if (!checkBounds(lease, request)) errors.push('worker, depth or transition budget exceeded');
  errors.push(...boundaryErrors(lease, request));
  return errors;
}

function boundaryErrors(lease, request) {
  const constraints = [
    ['requiredStateBoundaries', lease.stateBoundaries],
    ['requiredAuthority', lease.authorityCeiling], ['topologies', lease.allowedTopologies]
  ];
  return constraints.filter(([field, allowed]) => {
    const requested = request[field] || [];
    return !Array.isArray(requested) || !requested.every((value) => allowed.includes(value));
  }).map(([field]) => `${field} exceeds the lease`);
}

function createMorphogenesisLease(input = {}) {
  const lease = {
    nodeId: input.nodeId,
    allowedOperators: Array.isArray(input.allowedOperators) ? [...input.allowedOperators] : [],
    allowedTopologies: Array.isArray(input.allowedTopologies) ? [...input.allowedTopologies] : [],
    maxWorkers: input.maxWorkers,
    maxDepth: input.maxDepth,
    tokenBudget: input.tokenBudget,
    transitionBudget: input.transitionBudget,
    stateBoundaries: Array.isArray(input.stateBoundaries) ? [...input.stateBoundaries] : [],
    authorityCeiling: Array.isArray(input.authorityCeiling) ? [...input.authorityCeiling] : [],
    expiresAt: input.expiresAt
  };
  const validation = validateLease(lease);
  if (!validation.valid) throw new Error(`Invalid morphogenesis lease: ${validation.errors.join('; ')}`);
  return lease;
}

module.exports = { LEASE_ERROR, authorizeLocalMorphogenesis, createMorphogenesisLease, validateLease };
