'use strict';

const crypto = require('node:crypto');
const registry = require('./cognitiveObligationRegistry');
const handlersService = require('./cognitiveOmegaRuntimeHandlers');
const executionJournal = require('./cognitiveOmegaExecutionJournal');

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
  const idempotentEffects = new Set();

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
  return { execute: (request) => execute(request, handlers,
    { journal: input.journal, idempotentEffects }),
    registerReader: (reference, handler) => register(readers, reference, handler),
    registerSelector: (reference, handler) => register(selectors, reference, handler),
    registerTool: (reference, handler, options = {}) => {
      if (options.idempotent === true) idempotentEffects.add(`CALL:${reference}`);
      return register(tools, reference, handler);
    },
    registerInferer: (reference, handler) => register(inferers, reference, handler),
    registerVerifier: (reference, handler) => register(verifiers, reference, handler),
    registerEmitter: (reference, handler, options = {}) => {
      if (options.idempotent === true) idempotentEffects.add(`EMIT:${reference}`);
      return register(emitters, reference, handler);
    } };
}

module.exports = { createRuntime };

function executeState(input) {
  return { context: input.context || {}, objects: input.objects || {}, values: {}, receipts: {}, proofDigests: {},
    policy: input.policy || {}, allowEmit: input.allowEmit === true,
    verifierRegistry: input.verifierRegistry || createDefaultVerifierRegistry(input), mmu: input.mmu || null };
}

async function execute(input = {}, handlers, runtimeState = {}) {
    { const __genosStageResult2 = require('./cognitiveOmegaRuntimeServiceStages1.js').executeStage2({ Array, handlersService, input }); if (__genosStageResult2) return __genosStageResult2.value; }
    const operations = input.operations.map((operation) => (executeResult2(operation)));
    if (operations.some((operation) => !KINDS.has(operation.kind))) return handlersService.blocked('operation_kind_invalid');
    const plan = registry.plan({ version: registry.VERSION, operation: 'OMEGA',
      obligations: registryOperations(operations) });
    if (plan.status === 'blocked') return handlersService.blocked(plan.reason);
    const byId = new Map(operations.map((operation) => [operation.id, operation]));
    const state = executeState(input);
    const results = [];
    const journalDb = runtimeState.journal;
    { const __genosStageResult1 = await require('./cognitiveOmegaRuntimeServiceStages1.js').executeStage1({ executionJournal, handlersService, input, journalDb, journalRequest }); if (__genosStageResult1) return __genosStageResult1.value; }
    { const __genosStageResult5 = await require('./cognitiveOmegaRuntimeServiceStages1.js').executeStage5({ applyJournalResult, byId, dependenciesExecuted, executionJournal, handlers, input, journalDb, journalResult, plan, registerOperationVerifier, require, results, runtimeState, get state() { return state; }, set state(__genosNextStageValue) { state = __genosNextStageValue; } }); if (__genosStageResult5) return __genosStageResult5.value; }
    const digest = crypto.createHash('sha256').update(JSON.stringify(results)).digest('hex');
    return executeResult({ results, state, digest, input });
  }

function executeResult({ results, state, digest, input }) {
  return { status: 'emitted', results, values: state.values, digest: `sha256:${digest}`,
      economy: input.economy || null, mmu: state.mmu?.metrics?.() || null };
}

function journalRequest(input) {
  return { operations: input.operations, context: input.context || {}, objects: input.objects || {},
    policy: input.policy || {}, allowEmit: input.allowEmit === true, economy: input.economy || null };
}

function journalResult(result, state, operation) {
  return { operationResult: result, value: state.values[operation.id],
    receipt: state.receipts[operation.id], proofDigest: state.proofDigests[operation.id] };
}

function applyJournalResult(state, operation, result) {
  if (Object.hasOwn(result, 'value')) state.values[operation.id] = result.value;
  if (result.receipt !== undefined) state.receipts[operation.id] = result.receipt;
  if (result.proofDigest !== undefined) state.proofDigests[operation.id] = result.proofDigest;
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
