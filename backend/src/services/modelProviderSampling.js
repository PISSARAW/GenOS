'use strict';

function samplingFields(params) {
  const result = {};
  if (params.temperature !== undefined) {
    const value = Number(params.temperature);
    if (!Number.isFinite(value) || value < 0 || value > 2) throw new Error('Invalid sampling temperature.');
    result.temperature = value;
  }
  if (params.contextTokens !== undefined) {
    const value = Number(params.contextTokens);
    if (!Number.isInteger(value) || value < 256 || value > 131072) throw new Error('Invalid context token limit.');
    if (!params.nativeOllama) throw new Error('Context token limit requires native Ollama.');
    result.num_ctx = value;
  }
  return result;
}

function nativeOptions(params) {
  const result = samplingFields(params);
  if (params.outputLimit) result.num_predict = params.outputLimit;
  if (params.seed != null && Number.isInteger(Number(params.seed))) result.seed = Number(params.seed);
  return result;
}

module.exports = { samplingFields, nativeOptions };
