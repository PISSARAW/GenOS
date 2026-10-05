'use strict';

const crypto = require('node:crypto');
const registry = require('./cognitiveObligationRegistry');

const KINDS = new Set(['READ', 'SELECT', 'CALL', 'CHECK', 'EMIT']);

function blocked(reason, operation) {
  return { status: 'blocked', reason, operation: operation?.id || null };
}

function allowed(policy, kind, reference) {
  const rules = policy?.[kind.toLowerCase()];
  return rules === true || (Array.isArray(rules) && rules.includes(reference));
}

function resultValue(result) {
  return result && typeof result === 'object' && Object.hasOwn(result, 'value')
    ? result.value : result;
}

function verified(result) {
  return result?.valid === true || result?.status === 'verified' || result?.status === 'formally_proved';
}

function registryOperations(operations) {
  return operations.map(({ id, kind, state, dependsOn, basis, reason }) => ({
    id, kind, state, dependsOn, basis, reason
  }));
}

function operationInput(operation, values) {
  if (operation.input !== undefined) return operation.input;
  const dependencies = operation.dependsOn.map((id) => values[id]);
  return dependencies.length === 1 ? dependencies[0] : dependencies;
}

function createRuntime() {
  const readers = new Map();
  const selectors = new Map();
  const tools = new Map();
  const verifiers = new Map();
  const emitters = new Map();

  function register(map, reference, handler) {
    if (typeof reference !== 'string' || !reference || typeof handler !== 'function') {
      throw new Error('cognitive_runtime_handler_invalid');
    }
    map.set(reference, handler);
    return reference;
  }

  async function read(operation, state) {
    if (!allowed(state.policy, 'READ', operation.reference)) return blocked('read_not_authorized', operation);
    const reader = readers.get(operation.reference);
    if (!reader && !Object.hasOwn(state.objects, operation.reference)) return blocked('reader_missing', operation);
    const value = reader ? await reader({ reference: operation.reference, context: state.context })
      : state.objects[operation.reference];
    state.values[operation.id] = value;
    return { status: 'ready', value };
  }

  async function select(operation, state) {
    if (!allowed(state.policy, 'SELECT', operation.reference || operation.id)) {
      return blocked('select_not_authorized', operation);
    }
    const selector = selectors.get(operation.reference || operation.id);
    const input = operationInput(operation, state.values);
    const value = selector ? await selector({ input, context: state.context, values: state.values })
      : input;
    state.values[operation.id] = value;
    return { status: 'ready', value };
  }

  async function call(operation, state) {
    if (!allowed(state.policy, 'CALL', operation.reference)) return blocked('call_not_authorized', operation);
    const tool = tools.get(operation.reference);
    if (!tool) return blocked('tool_missing', operation);
    const value = await tool({ arguments: operation.arguments || operation.input,
      context: state.context, values: state.values });
    state.values[operation.id] = value;
    return { status: 'ready', value };
  }

  async function check(operation, state) {
    if (!allowed(state.policy, 'CHECK', operation.reference)) return blocked('check_not_authorized', operation);
    const verifier = verifiers.get(operation.reference);
    if (!verifier) return blocked('verifier_missing', operation);
    const receipt = await verifier({ candidate: operationInput(operation, state.values),
      context: state.context, values: state.values });
    if (!verified(receipt)) return blocked('verification_failed', operation);
    state.receipts[operation.id] = receipt;
    state.values[operation.id] = operationInput(operation, state.values);
    return { status: 'verified', receipt };
  }

  async function emit(operation, state) {
    if (!state.allowEmit || !allowed(state.policy, 'EMIT', operation.reference)) {
      return blocked('emit_not_authorized', operation);
    }
    const dependency = operation.dependsOn.map((id) => state.receipts[id]).find(Boolean);
    if (!dependency || !verified(dependency)) return blocked('emit_requires_verified_receipt', operation);
    const emitter = emitters.get(operation.reference);
    if (!emitter) return blocked('emitter_missing', operation);
    const value = await emitter({ value: operationInput(operation, state.values), receipt: dependency,
      context: state.context });
    state.values[operation.id] = value;
    return { status: 'emitted', value, receipt: dependency };
  }

  async function execute(input = {}) {
    if (!Array.isArray(input.operations) || !input.operations.length) return blocked('program_empty');
    const operations = input.operations.map((operation) => ({ ...operation,
      state: operation.state || 'open', dependsOn: operation.dependsOn || [] }));
    if (operations.some((operation) => !KINDS.has(operation.kind))) return blocked('operation_kind_invalid');
    const plan = registry.plan({ version: registry.VERSION, operation: 'OMEGA',
      obligations: registryOperations(operations) });
    if (plan.status === 'blocked') return blocked(plan.reason);
    const byId = new Map(operations.map((operation) => [operation.id, operation]));
    const state = { context: input.context || {}, objects: input.objects || {}, values: {}, receipts: {},
      policy: input.policy || {}, allowEmit: input.allowEmit === true };
    const results = [];
    for (const obligation of plan.obligations) {
      const operation = byId.get(obligation.id);
      const dependenciesReady = operation.dependsOn.every((id) => results.find((item) => item.id === id)?.status
        === 'ready' || results.find((item) => item.id === id)?.status === 'verified'
        || results.find((item) => item.id === id)?.status === 'emitted');
      if (!dependenciesReady) return { status: 'blocked', reason: 'dependency_execution_failed', results };
      const handler = { READ: read, SELECT: select, CALL: call, CHECK: check, EMIT: emit }[operation.kind];
      try {
        const result = await handler(operation, state);
        results.push({ id: operation.id, kind: operation.kind, ...result });
        if (result.status === 'blocked') return { status: 'blocked', reason: result.reason, results };
      } catch (error) {
        return { status: 'blocked', reason: 'operation_failed', operation: operation.id,
          error: error.message, results };
      }
    }
    const digest = crypto.createHash('sha256').update(JSON.stringify(results)).digest('hex');
    return { status: 'emitted', results, values: state.values, digest: `sha256:${digest}` };
  }

  return { execute,
    registerReader: (reference, handler) => register(readers, reference, handler),
    registerSelector: (reference, handler) => register(selectors, reference, handler),
    registerTool: (reference, handler) => register(tools, reference, handler),
    registerVerifier: (reference, handler) => register(verifiers, reference, handler),
    registerEmitter: (reference, handler) => register(emitters, reference, handler) };
}

module.exports = { createRuntime };
