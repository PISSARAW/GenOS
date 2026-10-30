'use strict';

function measuredUsage(result) {
  return result.providerCalled === true && result.tokenUsageMeasured === true
    && [result.inputTokens, result.outputTokens].every((value) => Number.isSafeInteger(value) && value >= 0);
}

function fromModelResult(result) {
  if (!result?.schemaViolation) return null;
  const inputTokens = Number(result.inputTokens || 0);
  const outputTokens = Number(result.outputTokens || 0);
  const measured = measuredUsage(result);
  return Object.assign(new Error('Model output did not satisfy the requested worker evidence schema.'), {
    code: 'WORKER_OUTPUT_SCHEMA_VIOLATION',
    workerArtifactDiagnostics: {
      ...result.schemaViolation,
      outputExcerpt: String(result.text || '').slice(0, 2048)
    },
    usage: { inputTokens, outputTokens, tokens: inputTokens + outputTokens },
    model: result.model, modelProvider: result.provider,
    ...(measured ? { modelUsage: { input_tokens: inputTokens, output_tokens: outputTokens,
      tokens: inputTokens + outputTokens, cost_usd: result.costUsd } } : {})
  });
}

module.exports = { fromModelResult };
