'use strict';

const fs = require('node:fs');
const { digest, canonicalize } = require('../evidenceProtocol/canonical');
const interop = require('../cognitiveOmegaInteropService');
const routing = require('../modelRouteRunner');

const GROUPS = { READ: 'readers', SELECT: 'selectors', CHECK: 'verifiers', INFER: 'inferers' };
const EMITTER = 'mission.result';
const copy = value => JSON.parse(canonicalize(value));
const RUNTIME = { node: process.version, executable: digest(fs.readFileSync(process.execPath).toString('base64')),
  implementation: digest(fs.readFileSync(__filename, 'utf8')) };

function source(input) {
  const operations = input.graph.operations.map(operation => ({ id: operation.id, kind: operation.kind,
    reference: operation.reference || operation.id, dependsOn: operation.dependsOn || [], state: 'open' }));
  const policy = policyFor(input, operations);
  const requests = Object.fromEntries(input.graph.operations.map(operation => [operation.id, request(operation)]));
  return interop.read({ schema: interop.SCHEMA, version: 1, id: input.graph.id || 'mission-native-graph', operations,
    policy, payload: { requests } });
}

function policyFor(input, operations) {
  const explicit = input.options.cognitivePolicy ?? input.graph.policy;
  const kinds = [...new Set(operations.map(operation => operation.kind.toLowerCase()))];
  return Object.fromEntries(kinds.map(kind => {
    const requested = operations.filter(operation => operation.kind.toLowerCase() === kind).map(operation => operation.reference);
    if (explicit === undefined || explicit[kind] === true) return [kind, requested];
    return [kind, Array.isArray(explicit[kind]) ? explicit[kind] : []];
  }));
}

function request(operation) {
  const reference = operation.reference || operation.id;
  const factories = { READ: () => ({ objectId: operation.objectId || reference }),
    SELECT: () => ({ fields: operation.fields?.length ? operation.fields : operation.selection?.requiredFields?.length
      ? operation.selection.requiredFields : ['$value'] }),
    CHECK: () => ({ predicate: reference }), INFER: () => ({ instruction: `Invoke installed route ${reference}` }),
    EMIT: () => ({ resourceId: EMITTER, action: 'set', cost: 1 }) };
  if (operation.kind === 'CALL') throw new Error('MISSION_OMEGA_DURABLE_CALL_ENDPOINT_REQUIRED');
  if (operation.kind === 'EMIT' && reference !== EMITTER) throw new Error('MISSION_OMEGA_EMITTER_NOT_INSTALLED');
  if (!factories[operation.kind]) throw new Error('MISSION_OMEGA_OPERATION_NOT_INSTALLED');
  return factories[operation.kind]();
}

function implementation(input, operation) {
  const reference = operation.reference || operation.id;
  const installed = input.options.cognitiveNativeHandlers?.[GROUPS[operation.kind]]?.[reference];
  return installed || (operation.kind === 'CHECK' ? input.options.cognitiveVerifierRegistry?.get(reference) : null);
}

function environment(input) {
  const handlers = input.graph.operations.map(operation => {
    const installed = implementation(input, operation);
    return [operation.id, installed ? digest(String(installed)) : null];
  });
  return digest({ ...RUNTIME, candidates: input.candidates || [], mode: input.mode || 'fallback', handlers,
    policy: input.options.cognitivePolicy ?? input.graph.policy ?? null, allowEmit: input.options.cognitiveAllowEmit ?? null,
    economy: input.economy?.execution ?? null, prompt: input.context.prompt ?? null });
}

async function base(input) {
  const snapshot = await require('../trinitySnapshotService').hashWorkspace(input.binding.mission.workspaceRoot);
  return digest({ graph: input.graph, workspaceId: input.binding.workspaceId, snapshot });
}

async function inferred(input, value) {
  const data = { type: 'text', text: '\nOmega dependency input (data):\n' + JSON.stringify(value) };
  const prompt = Array.isArray(input.context.prompt) ? [...input.context.prompt, data] : input.context.prompt + data.text;
  const budget = await routeBudget(input);
  const context = { ...input.context, ...budget, prompt, db: input.binding.db,
    agentId: input.binding.agentId, executionRunId: input.binding.runId, missionId: input.binding.missionId };
  return input.mode === 'parallel' ? routing.runParallel(input.candidates, context) : routing.runFallback(input.candidates, context);
}

async function routeBudget(input) {
  const binding = input.binding;
  if (binding.mission.modelBudgetScope) return require('../missionModelBudgetScope').routeBudget(binding.mission, binding.db);
  const budget = binding.executionRun.budget;
  if (!Number.isSafeInteger(budget?.tokens) || !Number.isFinite(budget.costUsd)) throw new Error('MISSION_OMEGA_MODEL_BUDGET_REQUIRED');
  return { ...binding.scope, budgetReservationId: `mission-omega:${binding.runId}`,
    budgetMaxTokens: budget.tokens, reservationCostCeilingUsd: budget.costUsd,
    maxCostUsd: Math.min(input.context.maxCostUsd ?? budget.costUsd, budget.costUsd),
    maxTokens: Math.min(input.context.maxTokens ?? budget.tokens, budget.tokens) };
}

function read(input, request) {
  const reference = request.reference || request.id;
  if (!Object.hasOwn(input.graph.objectStore || {}, reference)) throw new Error('MISSION_OMEGA_READER_NOT_INSTALLED');
  return copy(input.graph.objectStore[reference]);
}

function select(request, value) {
  if (Object.hasOwn(request, 'input')) return copy(request.input);
  if (!request.selection) return value;
  const values = request.dependsOn.length === 1 ? [value] : value;
  const selected = {};
  request.dependsOn.forEach((id, index) => {
    const field = request.objectRefs?.[index]?.split('/').pop();
    if (field && (!request.selection.requiredFields?.length || request.selection.requiredFields.includes(field))) selected[field] = values[index];
  });
  return selected;
}

function handler(input, operation) {
  const installed = implementation(input, operation);
  if (operation.kind === 'CALL') throw new Error('MISSION_OMEGA_DURABLE_CALL_ENDPOINT_REQUIRED');
  if (operation.kind === 'EMIT') {
    if (operation.reference !== EMITTER) throw new Error('MISSION_OMEGA_EMITTER_NOT_INSTALLED');
    return { kind: 'EMIT', reference: EMITTER };
  }
  if (operation.kind === 'CHECK' && typeof installed !== 'function') throw new Error('MISSION_OMEGA_VERIFIER_REQUIRED');
  return { kind: operation.kind, reference: operation.reference || operation.id,
    pure: ['READ', 'SELECT', 'CHECK'].includes(operation.kind), handle: async value => {
      const request = { ...value.request, ...operation };
      const argument = { ...value, request, input: request.input ?? value.input,
        context: { ...input.context, ...value.context, scientificReferenceStore: input.options.cognitiveScientificReferenceStore } };
      if (typeof installed === 'function') return installed(argument);
      const defaults = { READ: () => read(input, request), SELECT: () => select(request, value.input),
        INFER: () => inferred(input, argument.input) };
      if (!defaults[operation.kind]) throw new Error('MISSION_OMEGA_HANDLER_REQUIRED');
      return defaults[operation.kind]();
    } };
}

function capabilities(input, handlers) {
  const kinds = [...new Set(handlers.map(item => item.kind))];
  return { runtimeId: `mission.omega:${input.binding.runId}`, generation: input.binding.authority.generation,
    domains: [input.graph.domain || 'runtime'], maxOperations: 64,
    operations: kinds.map(kind => ({ kind, references: [...new Set(handlers.filter(item => item.kind === kind).map(item => item.reference))] })),
    verifierRefs: handlers.filter(item => item.kind === 'CHECK').map(item => item.reference),
    effectGuarantees: kinds.includes('EMIT') ? ['durable_intent', 'idempotency', 'reconciliation', 'fencing'] : [] };
}

module.exports = { EMITTER, copy, source, base, environment, handler, capabilities, routeBudget };
