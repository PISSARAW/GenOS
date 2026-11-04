'use strict';

function runtimeContract(mission) {
  if (mission.workerContract?.qualityElevation) return mission.workerContract.qualityElevation;
  return require('../workerEvidenceBarrierLocal').isOrchestratorMission(mission) ? mission.qualityElevation : null;
}

function boundGeneration(ctx) {
  const quality = runtimeContract(ctx.mission);
  if (!quality) return ctx;
  const requested = ctx.maxTokens || quality.maxOutputTokens;
  const maxTokens = Math.min(requested, quality.maxOutputTokens);
  const schema = ctx.responseFormatOverride?.schema ? JSON.stringify(ctx.responseFormatOverride.schema) : '';
  return { ...ctx, maxTokens, requestTokenBudget: Buffer.byteLength(ctx.promptText + schema, 'utf8') + maxTokens };
}

async function generate(ctx, invoke) {
  const bounded = boundGeneration(ctx);
  if (runtimeContract(ctx.mission)) return invoke(bounded);
  return require('../workerEvidenceSchemaRepair').generateWithSchemaRepair({ promptText: ctx.promptText,
    generate: repairedPrompt => invoke({ ...bounded, promptText: repairedPrompt }) });
}

function promptText(ctx, original) {
  let prompt = original;
  if (ctx.qualityRequest) prompt += `\n\nQUALITY REPAIR DATA (retain the required worker response schema):\n${ctx.qualityRequest.prompt}`;
  if (ctx.mission.qualityRepair) prompt += `\n\nORCHESTRATOR QUALITY OBLIGATIONS (data):\n${JSON.stringify(ctx.mission.qualityRepair)}`;
  const required = require('../workerTeamContract').instruction(ctx.mission);
  if (required) prompt += '\n\n' + required;
  return prompt;
}

function requestFields(ctx, generation) {
  if (!ctx.qualityRequest) return {};
  return { signal: ctx.qualityRequest.signal,
    maxTokens: Math.min(generation.maxTokens, ctx.qualityRequest.maxOutputTokens),
    ...(ctx.qualityRequest.operation === 'native_artifact_materialization'
      ? { responseFormatOverride: require('./qualityNativeMaterialization').responseFormat(ctx.mission, ctx.qualityRequest.artifactContent) }
      : {}) };
}

module.exports = { generate, boundGeneration, promptText, requestFields, runtimeContract };
