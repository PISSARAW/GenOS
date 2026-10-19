const Ajv = require('ajv');
const { assertActionGenome } = require('./actionGenomeValidator');
const { issueCausalReceipt } = require('./causalReceipt');

const INVOCATION_KEYS = ['actor', 'budget', 'input', 'leases', 'observedStateVersion', 'permissions'];

function requireShape(context) {
  const { invocation, state } = context;
  if (!invocation || !state || typeof state.version !== 'string') throw invalid('Invocation and versioned state are required.');
  if (Object.keys(invocation).some((key) => !INVOCATION_KEYS.includes(key))) throw invalid('Invocation contains unknown fields.');
  if (!invocation.actor?.id || !Array.isArray(invocation.permissions) || !Array.isArray(invocation.leases)) {
    throw invalid('Actor, permissions and leases are required.');
  }
  if (!invocation.budget || typeof invocation.budget !== 'object') throw invalid('Invocation budget is required.');
}

function invalid(message, details = []) {
  const error = new Error(message);
  error.code = 'ACTION_INVOCATION_INVALID';
  error.status = 400;
  error.details = details;
  return error;
}

function containsAll(actual, required) {
  return actual.includes('all') || required.every((item) => actual.includes(item));
}

function resolvePointer(root, pointer) {
  if (pointer === '/') return root;
  return pointer.slice(1).split('/').reduce((value, key) => value?.[key], root);
}

function compare(actual, predicate) {
  if (predicate.operator === 'exists') return (actual !== undefined) === Boolean(predicate.value);
  if (predicate.operator === 'eq') return actual === predicate.value;
  if (predicate.operator === 'neq') return actual !== predicate.value;
  if (predicate.operator === 'gte') return typeof actual === 'number' && actual >= predicate.value;
  if (predicate.operator === 'lte') return typeof actual === 'number' && actual <= predicate.value;
  return false;
}

function preconditionsPass(genome, context) {
  const root = { input: context.invocation.input, state: context.state.snapshot };
  return genome.contract.preconditions.every((predicate) => compare(resolvePointer(root, predicate.path), predicate));
}

function inputPass(genome, input) {
  try {
    return new Ajv({ allErrors: true, strict: true }).compile(genome.contract.inputSchema)(input);
  } catch (error) {
    throw invalid('Action input schema cannot be compiled.', [{ message: error.message }]);
  }
}

function buildVerdicts(genome, context) {
  const { invocation, state } = context;
  return [
    { gate: 'input_schema', passed: inputPass(genome, invocation.input) },
    { gate: 'permissions', passed: containsAll(invocation.permissions, genome.authority.permissions) },
    { gate: 'leases', passed: containsAll(invocation.leases, genome.authority.leases) },
    { gate: 'budget_duration', passed: invocation.budget.maxDurationMs <= genome.budget.maxDurationMs },
    { gate: 'budget_cost', passed: invocation.budget.maxCostUnits <= genome.budget.maxCostUnits },
    { gate: 'state_version', passed: invocation.observedStateVersion === state.version },
    { gate: 'preconditions', passed: preconditionsPass(genome, context) }
  ];
}

function evaluateInvocation(context) {
  const genome = assertActionGenome(context.genome);
  requireShape(context);
  const verdicts = buildVerdicts(genome, context);
  return issueCausalReceipt({ genome, invocation: context.invocation, state: context.state, verdicts });
}

module.exports = { evaluateInvocation };
