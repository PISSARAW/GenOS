'use strict';

function checkTemp(val) {
  if (val === undefined) return {};
  const v = Number(val);
  if (!Number.isFinite(v) || v < 0 || v > 2) throw new Error('Invalid sampling temperature.');
  return { temperature: v };
}

function checkTopP(val) {
  if (val === undefined) return {};
  const v = Number(val);
  if (!Number.isFinite(v) || v < 0 || v > 1) throw new Error('Invalid sampling topP.');
  return { top_p: v };
}

function checkCtx(params) {
  if (params.contextTokens === undefined) return {};
  const v = Number(params.contextTokens);
  if (!Number.isInteger(v) || v < 256 || v > 131072) throw new Error('Invalid context token limit.');
  if (!params.nativeOllama) throw new Error('Context token limit requires native Ollama.');
  return { num_ctx: v };
}

function samplingFields(params) {
  return { ...checkTemp(params.temperature), ...checkTopP(params.topP), ...checkCtx(params) };
}

function nativeOptions(params) {
  const result = samplingFields(params);
  if (params.outputLimit) result.num_predict = params.outputLimit;
  if (params.seed != null && Number.isInteger(Number(params.seed))) result.seed = Number(params.seed);
  return result;
}

module.exports = { samplingFields, nativeOptions };
