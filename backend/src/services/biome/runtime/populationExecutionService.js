'use strict';

const ledger = require('./executionLedger');
const bounded = require('./boundedInvocation');

async function execute(sessionId, request, context) {
  validateRequest(request);
  const options = require('./executionAdapterRegistry').resolveOptions(request.providerId, context.options);
  const executor = options.executors?.[request.providerId];
  if (typeof executor !== 'function') return abstained(request, 'configured_provider_required');
  if (typeof options.authorizeExecution !== 'function') return abstained(request, 'execution_authorization_required');
  const authorized = await bounded.invoke(options.authorizeExecution, { sessionId, request: structuredClone(request) }, options);
  if (authorized !== true) return abstained(request, 'execution_authorization_denied');
  const reserved = await context.operate({ sessionId, options, operation: 'execution_reserve', input: request,
    apply: session => ledger.reserve(session, request) });
  if (!reserved.reserved) return { ...reserved.execution,
    status: reserved.execution.status === 'running' ? 'indeterminate' : reserved.execution.status };
  const outcome = await invoke(executor, { sessionId, request: { ...request, ...reserved.profile } }, options);
  return context.operate({ sessionId, options, operation: 'execution_complete', input: outcome,
    apply: session => ledger.complete(session, outcome) });
}

async function invoke(executor, invocation, options) {
  const { sessionId, request } = invocation;
  try {
    const result = await bounded.invoke(executor, structuredClone({ sessionId, ...request }), options);
    const output = result?.output ?? result;
    const outputDigest = ledger.digest(output);
    const verification = typeof options.verifyExecution === 'function'
      ? await bounded.invoke(options.verifyExecution, structuredClone({ sessionId, executionId: request.executionId,
        output, outputDigest, capability: request.capability }), options) : null;
    return { executionId: request.executionId, output, outputDigest, verification,
      consumed: result?.consumed, quality: result?.quality };
  } catch (error) {
    return { executionId: request.executionId, failed: true, error: error.message,
      indeterminate: ['BIOME_EXECUTION_TIMEOUT', 'BIOME_EXECUTION_CANCELLED'].includes(error.code) };
  }
}

function validateRequest(request) {
  const names = ['executionId', 'populationId', 'individualId', 'providerId', 'capability'];
  if (!request || names.some(key => typeof request[key] !== 'string' || !request[key].trim())) {
    throw Object.assign(new Error('Execution requires identity, population, individual, provider and capability.'), {
      code: 'BIOME_EXECUTION_REQUEST_INVALID'
    });
  }
}

function abstained(request, reason) { return { executionId: request.executionId, status: 'abstained', reason }; }

module.exports = { execute };
