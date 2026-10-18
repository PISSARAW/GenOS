'use strict';

const SCHEMA = 'genos.method-contract/v1';
const STATUSES = Object.freeze(['draft', 'bound', 'executed', 'violated', 'revoked']);

const FIELD_MAP = {
  methodId: 'method_id',
  methodName: 'method_name',
  preconditions: 'preconditions',
  postconditions: 'postconditions',
  invariants: 'invariants',
  budget: 'budget',
  lease: 'lease'
};

function buildMethodContract(input = {}) {
  const contract = {
    schema: SCHEMA,
    method_id: null,
    method_name: null,
    parameters: {},
    preconditions: [],
    postconditions: [],
    invariants: [],
    budget: { max_tokens: null, max_cost_usd: null, max_latency_ms: null },
    lease: { tool_ids: [], expires_at: null },
    status: 'draft',
    version: 1,
    receipt: null
  };
  for (const [src, dst] of Object.entries(FIELD_MAP)) {
    if (input[src] !== undefined) contract[dst] = input[src];
  }
  return validateMethodContract(contract);
}

function validateMethodContract(contract) {
  if (!contract || contract.schema !== SCHEMA) {
    throw new Error(`method_contract.schema must be ${SCHEMA}`);
  }
  if (!Array.isArray(contract.preconditions)) {
    throw new Error('method_contract.preconditions must be an array');
  }
  if (!Array.isArray(contract.postconditions)) {
    throw new Error('method_contract.postconditions must be an array');
  }
  if (!Array.isArray(contract.invariants)) {
    throw new Error('method_contract.invariants must be an array');
  }
  if (!STATUSES.includes(contract.status)) {
    throw new Error(`method_contract.status must be one of ${JSON.stringify(STATUSES)}`);
  }
  return contract;
}

function bindMethodContract(contract, binding = {}) {
  const next = { ...contract, version: contract.version + 1 };
  for (const [src, dst] of Object.entries(FIELD_MAP)) {
    if (binding[src] !== undefined) next[dst] = binding[src];
  }
  next.status = 'bound';
  return validateMethodContract(next);
}

function executeMethodContract(contract, context = {}) {
  if (contract.status !== 'bound') {
    throw new Error('method_contract must be bound before execution');
  }
  const violations = checkPreconditions(contract.preconditions, context);
  if (violations.length > 0) {
    return { ok: false, violations, contract: markViolated(contract) };
  }
  const result = { ok: true, method_id: contract.method_id, executed_at: new Date().toISOString() };
  const executed = { ...contract, status: 'executed', receipt: buildReceipt(contract, result, context) };
  return { ok: true, result, contract: validateMethodContract(executed) };
}

function checkPreconditions(preconditions, context) {
  const violations = [];
  for (const precondition of preconditions) {
    if (typeof precondition !== 'object' || !precondition.id) {
      violations.push({ id: 'unknown', message: 'invalid precondition' });
      continue;
    }
    if (!precondition.satisfied(context)) {
      violations.push({ id: precondition.id, message: precondition.message || 'precondition not satisfied' });
    }
  }
  return violations;
}

function markViolated(contract) {
  return { ...contract, status: 'violated' };
}

function buildReceipt(contract, result, context) {
  return {
    schema: 'genos.method-contract-receipt/v1',
    method_id: contract.method_id,
    result_digest: null,
    executed_at: result.executed_at,
    context_provenance: context.provenance || null,
    valid: true
  };
}

function revokeMethodContract(contract) {
  return { ...contract, status: 'revoked' };
}

module.exports = {
  SCHEMA,
  STATUSES,
  buildMethodContract,
  validateMethodContract,
  bindMethodContract,
  executeMethodContract,
  checkPreconditions,
  markViolated,
  buildReceipt,
  revokeMethodContract
};
