'use strict';

const crypto = require('node:crypto');
const registry = require('./cognitiveObligationRegistry');
const handlersService = require('./cognitiveOmegaRuntimeHandlers');

const KINDS = new Set(['READ', 'SELECT', 'CALL', 'INFER', 'CHECK', 'EMIT']);





function resultValue(result) {
  return result && typeof result === 'object' && Object.hasOwn(result, 'value')
    ? result.value : result;
}



function registryOperations(operations) {
  return operations.map(({ id, kind, state, dependsOn, basis, reason }) => ({
    id, kind, state, dependsOn, basis, reason
  }));
}





function createDefaultVerifierRegistry(input) {
  if (input.verifierRegistry !== undefined) return input.verifierRegistry;
  const { createRegistry } = require('./cognitiveEpistemicCheckService');
  return createRegistry({ runIsolated: input.runIsolated, handlers: input.verifierHandlers,
    descriptors: input.verifierDescriptors || input.verificationDescriptors });
}

function registerOperationVerifier(operation, registry) {
  const descriptor = operation.verifier || operation.verificationDescriptor
    || (operation.verification && typeof operation.verification === 'object'
      ? operation.verification : null);
  const resolved = descriptor || registry?.resolve?.(operation.verification, { operation });
  if (resolved?.type && typeof registry?.register === 'function') {
    registry.register(operation.reference, resolved);
  }
}

function createRuntime(input = {}) {
  const readers = new Map();
  const selectors = new Map();
  const tools = new Map();
  const inferers = new Map();
  const verifiers = new Map();
  const emitters = new Map();

  function register(map, reference, handler) {
    if (typeof reference !== 'string' || !reference || typeof handler !== 'function') {
      throw new Error('cognitive_runtime_handler_invalid');
    }
    map.set(reference, handler);
    return reference;
  }















  const handlers = {
    READ: (operation, state) => handlersService.read(operation, state, readers),
    SELECT: (operation, state) => handlersService.select(operation, state, selectors),
    CALL: (operation, state) => handlersService.call(operation, state, tools),
    INFER: (operation, state) => handlersService.infer(operation, state, inferers),
    CHECK: (operation, state) => handlersService.check(operation, state, verifiers),
    EMIT: (operation, state) => handlersService.emit(operation, state, emitters)
  };
  return { execute: (request) => execute(request, handlers),
    registerReader: (reference, handler) => register(readers, reference, handler),
    registerSelector: (reference, handler) => register(selectors, reference, handler),
    registerTool: (reference, handler) => register(tools, reference, handler),
    registerInferer: (reference, handler) => register(inferers, reference, handler),
    registerVerifier: (reference, handler) => register(verifiers, reference, handler),
    registerEmitter: (reference, handler) => register(emitters, reference, handler) };
}

module.exports = { createRuntime };

function executeState(input) {
  return { context: input.context || {}, objects: input.objects || {}, values: {}, receipts: {}, proofDigests: {},
    policy: input.policy || {}, allowEmit: input.allowEmit === true,
    verifierRegistry: input.verifierRegistry || createDefaultVerifierRegistry(input), mmu: input.mmu || null };
}

async function execute(input = {}, handlers) {
    if (!Array.isArray(input.operations) || !input.operations.length) return handlersService.blocked('program_empty');
    const operations = input.operations.map((operation) => (executeResult2(operation)));
    if (operations.some((operation) => !KINDS.has(operation.kind))) return handlersService.blocked('operation_kind_invalid');
    const plan = registry.plan({ version: registry.VERSION, operation: 'OMEGA',
      obligations: registryOperations(operations) });
    if (plan.status === 'blocked') return handlersService.blocked(plan.reason);
    const byId = new Map(operations.map((operation) => [operation.id, operation]));
    const state = executeState(input);
    const results = [];
    for (const obligation of plan.obligations) {
      const operation = byId.get(obligation.id);
      const dependenciesReady = dependenciesExecuted(operation, results);
      if (!dependenciesReady) return { status: 'blocked', reason: 'dependency_execution_failed', results };
      registerOperationVerifier(operation, state.verifierRegistry);
      const handler = handlers[operation.kind];
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
    return executeResult({ results, state, digest, input });
  }

function executeResult({ results, state, digest, input }) {
  return { status: 'emitted', results, values: state.values, digest: `sha256:${digest}`,
      economy: input.economy || null, mmu: state.mmu?.metrics?.() || null };
}

function executeResult2(operation) {
  return { ...operation,
      state: operation.state || 'open', dependsOn: operation.dependsOn || [] };
}

function dependenciesExecuted(operation, results) {
  return operation.dependsOn.every((id) => results.find((item) => item.id === id)?.status
        === 'ready' || results.find((item) => item.id === id)?.status === 'verified'
        || results.find((item) => item.id === id)?.status === 'emitted');
}
