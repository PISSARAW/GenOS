'use strict';

const crypto = require('node:crypto');
const provider = require('../../../backend/src/services/modelProvider');

async function generate(spec) {
  const started = Date.now();
  if (Buffer.byteLength(spec.prompt) > spec.protocol.inputByteLimit) throw new Error('Frozen input byte budget exceeded');
  if (spec.prompt.includes('PRIVATE_EVALUATOR_')) throw new Error('Private evaluator canary reached candidate prompt');
  const request = { model: spec.protocol.model, endpoint: spec.protocol.endpoint, prompt: spec.prompt, stream: false,
    seed: spec.seed, temperature: spec.protocol.temperature, contextTokens: spec.protocol.contextTokens,
    maxTokens: spec.budget.maxOutputTokens, timeoutMs: spec.protocol.timeoutMs, enforceSchema: false,
    responseFormat: 'json_object' };
  const promptHash = crypto.createHash('sha256').update(spec.prompt).digest('hex');
  let response;
  try {
    response = await provider.generate(request);
    const candidate = JSON.parse(response.text);
    const measurement = { inputTokens: response.inputTokens, outputTokens: response.outputTokens,
      measured: response.tokenUsageMeasured === true, servedModel: response.servedModel };
    if (!measurement.measured) throw new Error('Provider token counts unavailable');
    if (measurement.servedModel !== spec.protocol.model.replace('ollama://', '')) throw new Error('Served model mismatch');
    if (measurement.inputTokens + spec.budget.maxOutputTokens > spec.protocol.contextTokens) throw new Error('Context budget exceeded');
    if (measurement.outputTokens > spec.budget.maxOutputTokens) throw new Error('Output budget exceeded');
    return { candidate, text: response.text, measurement, durationMs: Date.now() - started,
      prompt: spec.prompt, promptHash, seed: spec.seed, requestOptions: {
        temperature: request.temperature, contextTokens: request.contextTokens, maxTokens: request.maxTokens } };
  } catch (error) {
    return { error: error.message, text: response?.text,
      measurement: response ? { inputTokens: response.inputTokens, outputTokens: response.outputTokens,
        measured: response.tokenUsageMeasured === true, servedModel: response.servedModel } : undefined,
      durationMs: Date.now() - started, prompt: spec.prompt, promptHash, seed: spec.seed };
  }
}

module.exports = { generate };
