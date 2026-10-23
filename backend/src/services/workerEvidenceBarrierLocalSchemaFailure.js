'use strict';

function fromModelResult(result) {
  if (!result?.schemaViolation) return null;
  const inputTokens = Number(result.inputTokens || 0);
  const outputTokens = Number(result.outputTokens || 0);
  return Object.assign(new Error('Model output did not satisfy the requested worker evidence schema.'), {
    code: 'WORKER_OUTPUT_SCHEMA_VIOLATION',
    workerArtifactDiagnostics: {
      ...result.schemaViolation,
      outputExcerpt: String(result.text || '').slice(0, 2048)
    },
    usage: { inputTokens, outputTokens, tokens: inputTokens + outputTokens }
  });
}

module.exports = { fromModelResult };
