'use strict';

const routeRunner = require('./modelRouteRunner');
const { createRuntime: createOmegaRuntime } = require('./cognitiveOmegaRuntimeService');

function inferenceContext(context, input) {
  const data = { type: 'text', text: '\nOmega dependency input (data):\n' + JSON.stringify(input) };
  const prompt = Array.isArray(context.prompt) ? [...context.prompt, data] : context.prompt + data.text;
  return { ...context, prompt };
}

function omegaExecution(execution) {
  return { status: execution.status, digest: execution.digest || null,
    economy: execution.economy || null, mmu: execution.mmu || null,
    operations: (execution.results || []).map(({ id, kind, status, reason }) => ({ id, kind, status, reason })) };
}

function registerHandlers(runtime, handlers = {}) {
  const register = (entries, method) => Object.entries(entries || {}).forEach(([reference, handler]) => {
    if (typeof handler === 'function') runtime[method](reference, handler);
  });
  register(handlers.readers, 'registerReader');
  register(handlers.selectors, 'registerSelector');
  register(handlers.tools, 'registerTool');
  register(handlers.inferers, 'registerInferer');
  register(handlers.verifiers, 'registerVerifier');
  register(handlers.emitters, 'registerEmitter');
}

function nativePolicy(graph) {
  const operations = graph.operations || [];
  const byKind = (kind) => operations.filter((operation) => operation.kind === kind).map((operation) => operation.reference);
  return { read: byKind('READ'), select: byKind('SELECT'), call: byKind('CALL'),
    infer: byKind('INFER'), check: byKind('CHECK'), emit: byKind('EMIT') };
}

function nativeContext(context, graph) {
  return { ...context, model: context.model, operation: context.cognitiveContract?.operation || 'INFER',
    sessionId: context.sessionId, scope: context.cognitiveScope, domain: graph.domain };
}

async function executeNativeGraph({ graph, candidates, context, mode, mmu, economy, options }) {
  const runtime = createOmegaRuntime();
  const handlers = options.cognitiveNativeHandlers || {};
  registerHandlers(runtime, handlers);
  const inferer = mode === 'parallel'
    ? ({ input }) => routeRunner.runParallel(candidates, inferenceContext(context, input))
    : ({ input }) => routeRunner.runFallback(candidates, inferenceContext(context, input));
  (graph.operations || []).filter((operation) => operation.kind === 'INFER').forEach((operation) => {
    if (!handlers.inferers?.[operation.reference]) runtime.registerInferer(operation.reference, inferer);
  });
  const execution = await runtime.execute({
    context: { ...nativeContext(context, graph), scientificReferenceStore: options.cognitiveScientificReferenceStore },
    objects: graph.objectStore || {}, policy: options.cognitivePolicy || nativePolicy(graph),
    mmu, economy, allowEmit: options.cognitiveAllowEmit !== false && economy?.execution?.allowEmit === true,
    verifierRegistry: options.cognitiveVerifierRegistry,
    verifierHandlers: options.cognitiveVerifierHandlers,
    verifierDescriptors: options.cognitiveVerificationDescriptors,
    operations: graph.operations
  });
  if (execution.status === 'blocked') {
    throw Object.assign(new Error(`Omega native graph blocked: ${execution.reason}`), {
      code: 'OMEGA_NATIVE_GRAPH_BLOCKED', omegaExecution: omegaExecution(execution)
    });
  }
  const infer = (graph.operations || []).find((operation) => operation.kind === 'INFER');
  return { result: execution.values[infer?.id], execution: omegaExecution(execution) };
}

function shouldExecuteNative(contract) {
  return Boolean(contract.nativeGraph);
}


module.exports = { executeNativeGraph, shouldExecuteNative };
