'use strict';

const { executeElevationLoop } = require('./qualityElevationService');
const { verifyContract, fail } = require('./qualityContract');
const { modelUri, createAdapter } = require('./qualityRuntimeModelAdapter');

function feedback(result) {
  return { sessionId: result.session.sessionId, finalStatus: result.finalStatus,
    qualitySatisfied: result.promoted, terminalError: result.terminalError,
    defects: result.bestVersion?.defects || [], progress: result.progress,
    budget: result.session.budget, artifactDigest: result.bestVersion?.digest || null };
}

async function checkpoint(ctx, session) {
  await persistSession(ctx, session);
  if (ctx.onCheckpoint) await ctx.onCheckpoint(session);
  const event = { eventType: 'GQEL_CHECKPOINT', action: 'QUALITY_REVIEW',
    detail: 'Native quality execution checkpoint; this is not mission promotion.',
    payload: { executionRunId: ctx.executionRun.id, qualitySession: session } };
  const result = await require('../strategyExecutionService').recordExecutionEvent(ctx.db, ctx.mission.agentId, event);
  if (result?.halt) throw fail('WORKER_EXECUTION_HALTED', result.reason);
}

async function persistSession(ctx, session) {
  return require('./qualityReceiptService').recordQualityCheckpoint({ db: ctx.db,
    worker: ctx.mission, executionRunId: ctx.executionRun.id, session });
}

function contractOf(input) { return input.contract || input.mission.workerContract?.qualityElevation || input.mission.qualityElevation; }
function runtimeOf(input) { return input.runtime || input.mission.qualityRuntime || input.mission.workerContract?.qualityRuntime || {}; }
function reviewersFor(ctx, config) {
  return (config.reviewers || []).map(reader => ({ ...reader, model: modelUri(reader.model),
    dependencyGroup: reader.dependencyGroup || modelUri(reader.model), review: createAdapter(ctx, reader.model) }));
}
async function runWorkerQuality(input) {
  const contract = contractOf(input);
  verifyContract(contract);
  if (!input.executionRun?.id) throw fail('WORKER_EXECUTION_RUN_REQUIRED', 'Quality execution requires a native run.');
  const config = runtimeOf(input);
  const ctx = { ...input, contract, usage: input.usage || { inputTokens: 0, outputTokens: 0, costUsd: 0 } };
  const reviewers = reviewersFor(ctx, config);
  const generator = input.generator || createAdapter(ctx, config.generatorModel || input.generationContext.workerModel);
  const result = await executeElevationLoop({ contract, generator, reviewers,
    planScenes: input.planScenes ?? config.planScenes, initialContent: input.initialContent,
    verifier: input.verifier, repairObligations: input.mission.qualityRepair,
    onCheckpoint: session => checkpoint(ctx, session) });
  try { await persistSession(ctx, result.session); }
  catch (error) { throw qualityFailure(result, error); }
  return { ...result, qualityFeedback: feedback(result), nativeUsage: ctx.usage };
}

function qualityFailure(result, error) {
  const terminalError = { code: error.code || 'GQEL_RECEIPT_FAILED', message: error.message };
  return Object.assign(fail(terminalError.code, terminalError.message), { qualityFeedback: {
    ...feedback(result), qualitySatisfied: false, finalStatus: 'needs_review', terminalError } });
}

function requireSatisfied(result) {
  if (result.promoted) return;
  throw Object.assign(fail(result.terminalError?.code || 'WORKER_QUALITY_ELEVATION_FAILED',
    'Native quality execution stopped without an accepted artifact.'), { qualityFeedback: result.qualityFeedback });
}

module.exports = { runWorkerQuality, requireSatisfied, feedback, qualityFailure };
