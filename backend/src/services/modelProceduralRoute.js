'use strict';

const procedures = require('./proceduralCompilationService');

async function record(options, contract, execution) {
  if (!options.cognitiveProceduralize || !options.db || !options.agentId) return null;
  const evidenceRefs = Array.isArray(options.cognitiveEvidenceRefs)
    ? [...new Set(options.cognitiveEvidenceRefs)] : [];
  if (!evidenceRefs.length) return { status: 'blocked', reason: 'procedural_evidence_required' };
  const contextHash = contract.digest || `omega:${options.cognitiveDomain || 'runtime'}`;
  const context = procedures.contextFor(options, contract);
  await procedures.recordTrace(options.db, { agentId: options.agentId, contextHash, context,
    steps: execution.operations.map((operation) => `${operation.kind}:${operation.id}`),
    input: options.prompt, evidenceRefs, success: true });
  const input = { agentId: options.agentId, contextHash, context,
    policy: options.cognitiveProceduralPolicy, executorId: options.cognitiveProcedureExecutorId,
    validator: options.cognitiveProcedureValidator,
    autoPromote: options.cognitiveProcedureAutoPromote !== false
      && typeof options.cognitiveProcedureValidator === 'function'
      && (typeof options.cognitiveProcedureExecutor === 'function' || options.cognitiveProcedureExecutorId) };
  return procedures.compileAndPromote(options.db, input);
}

async function recordAfter({ options, contract, execution, previous }) {
  if (previous) return previous;
  try { return await record(options, contract, execution); }
  catch (error) { return { status: 'telemetry_failed', reason: error.message }; }
}

async function reuse(options, contract) {
  if (!options.db || !options.agentId) return null;
  const contextHash = contract.digest || `omega:${options.cognitiveDomain || 'runtime'}`;
  const context = procedures.contextFor(options, contract);
  return procedures.reuse(options.db, { agentId: options.agentId, contextHash, context,
    input: options.prompt, executor: options.cognitiveProcedureExecutor,
    validateReceipt: options.cognitiveProcedureReceiptValidator,
    validateResult: options.cognitiveProcedureResultValidator });
}

async function attempt(options, contract) {
  if (options.providerContinuity) return { reused: null, error: null };
  try { return { reused: await reuse(options, contract), error: null }; }
  catch (error) { return { reused: null,
    error: { status: 'telemetry_failed', reason: error.message } }; }
}

function result(reused) {
  if (reused.value && typeof reused.value === 'object') {
    return { ...reused.value, model: reused.model || 'procedural', provider: 'procedural',
      inputTokens: 0, outputTokens: 0, costUsd: 0 };
  }
  return { text: String(reused.value ?? ''), model: 'procedural', provider: 'procedural',
    inputTokens: 0, outputTokens: 0, costUsd: 0 };
}

function assertSafeAttempt(reused) {
  if (reused?.status !== 'execution_failed') return;
  throw Object.assign(new Error(`Procedural execution failed: ${reused.reason}`),
    { code: 'PROCEDURAL_EXECUTION_FAILED', procedural: reused });
}

module.exports = { record, recordAfter, reuse, attempt, result, assertSafeAttempt };
