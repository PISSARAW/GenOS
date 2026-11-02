'use strict';

const { fail } = require('./qualityContract');

function modelUri(model) {
  if (typeof model !== 'string' || !model.trim()) throw fail('GQEL_MODEL_REQUIRED', 'An explicit model route is required.');
  return model.includes('://') ? model : `ollama://${model}`;
}

function meteredReply(result, content) {
  if (result.tokenUsageMeasured !== true) throw fail('GQEL_USAGE_UNVERIFIED', 'Estimated provider tokens cannot authorize quality acceptance.');
  const usage = { inputTokens: result.inputTokens, outputTokens: result.outputTokens };
  if (![usage.inputTokens, usage.outputTokens].every(value => Number.isSafeInteger(value) && value >= 0)) {
    throw fail('GQEL_USAGE_UNVERIFIED', 'Native model routing must return measured token usage.');
  }
  if (result.schemaViolation) throw fail('GQEL_REVIEW_INVALID', 'Native model response failed its requested schema.');
  if (!result.finishReason) throw fail('GQEL_COMPLETION_UNVERIFIED', 'Native provider completion was not observed.');
  return { content, usage, model: result.model, servedModel: result.servedModel || null,
    provider: result.provider || null, routeAttemptId: result.routeAttemptId || null,
    finishReason: result.finishReason };
}

function deadlineOf(mission) {
  const value = mission.executionDeadlineAt;
  if (value == null) return Infinity;
  const deadline = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(deadline)) throw fail('GQEL_TIME_BUDGET', 'The parent deadline is invalid.');
  return deadline;
}

async function assertActive(ctx, request) {
  if (request.signal?.aborted || ctx.isCancelled?.()) throw fail('GQEL_CANCELLED', 'Quality execution cancelled.');
  if (Date.now() >= deadlineOf(ctx.mission)) {
    throw fail('GQEL_TIME_BUDGET', 'The parent mission deadline has expired.');
  }
  await require('../missionEnvelopeAuthority').assertRun(ctx.db, {
    agentId: ctx.mission.agentId, runId: ctx.executionRun.id, mission: ctx.mission
  });
}

function routingContext(ctx, input) {
  const request = input.request, model = modelUri(input.model);
  return { ...ctx.generationContext, db: ctx.db, mission: ctx.mission, executionRun: ctx.executionRun,
    workerModel: model, promptText: request.prompt, signal: request.signal,
    policy: { primary: model, fallback: [], preferLocal: model.startsWith('ollama://') },
    maxTokens: request.maxOutputTokens,
    requestTokenBudget: Buffer.byteLength(request.prompt + JSON.stringify(request.responseSchema || ''), 'utf8')
      + request.maxOutputTokens,
    latencyMs: Math.min(ctx.contract.callTimeoutMs, ctx.generationContext.latencyMs),
    responseFormatOverride: request.responseSchema ? { name: 'genos_quality_review', schema: request.responseSchema } : undefined };
}

function createAdapter(ctx, model) {
  return async request => {
    await assertActive(ctx, request);
    const result = await ctx.generate(routingContext(ctx, { request, model }));
    if (result.model !== modelUri(model)) throw fail('GQEL_MODEL_MISMATCH', 'Native routing changed the contracted quality model.');
    ctx.usage.inputTokens += result.inputTokens || 0;
    ctx.usage.outputTokens += result.outputTokens || 0;
    ctx.usage.costUsd += result.costUsd || 0;
    return meteredReply(result, result.text);
  };
}

module.exports = { modelUri, meteredReply, assertActive, createAdapter };
