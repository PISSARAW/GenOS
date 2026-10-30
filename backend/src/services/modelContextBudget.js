'use strict';

function contextError(message) {
  return Object.assign(new Error(message), { code: 'MODEL_CONTEXT_LIMIT_EXCEEDED' });
}

function assertContextBudget(options) {
  if (options.contextTokens === undefined) return;
  const context = Number(options.contextTokens);
  if (!Number.isInteger(context) || context < 256 || context > 131072) {
    throw contextError('Explicit model context limit must be an integer between 256 and 131072.');
  }
  const output = options.maxTokens === undefined ? 2048 : Number(options.maxTokens);
  if (!Number.isSafeInteger(output) || output <= 0) throw contextError('Model output token limit must be a positive integer.');
  const estimatedInput = Math.ceil(Buffer.byteLength(String(options.prompt || ''), 'utf8') / 4);
  if (estimatedInput + output > context) {
    throw contextError(`Estimated prompt plus output exceeds explicit context (${estimatedInput} + ${output} > ${context}).`);
  }
}
module.exports = { assertContextBudget };
