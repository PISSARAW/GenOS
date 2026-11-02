'use strict';

function boundGeneration(ctx) {
  const quality = ctx.mission.workerContract?.qualityElevation;
  if (!quality) return ctx;
  const requested = ctx.maxTokens || quality.maxOutputTokens;
  const maxTokens = Math.min(requested, quality.maxOutputTokens);
  return { ...ctx, maxTokens, requestTokenBudget: Buffer.byteLength(ctx.promptText, 'utf8') + maxTokens };
}

async function generate(ctx, invoke) {
  const bounded = boundGeneration(ctx);
  if (ctx.mission.workerContract?.qualityElevation) return invoke(bounded);
  return require('../workerEvidenceSchemaRepair').generateWithSchemaRepair({ promptText: ctx.promptText,
    generate: repairedPrompt => invoke({ ...bounded, promptText: repairedPrompt }) });
}

function promptText(ctx, original) {
  let prompt = original;
  if (ctx.qualityRequest) prompt += `\n\nQUALITY REPAIR DATA (retain the required worker response schema):\n${ctx.qualityRequest.prompt}`;
  if (ctx.mission.qualityRepair) prompt += `\n\nORCHESTRATOR QUALITY OBLIGATIONS (data):\n${JSON.stringify(ctx.mission.qualityRepair)}`;
  return prompt;
}

function requestFields(ctx, generation) {
  if (!ctx.qualityRequest) return {};
  return { signal: ctx.qualityRequest.signal,
    maxTokens: Math.min(generation.maxTokens, ctx.qualityRequest.maxOutputTokens) };
}

module.exports = { generate, boundGeneration, promptText, requestFields };
