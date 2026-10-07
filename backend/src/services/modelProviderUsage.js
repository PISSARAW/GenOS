'use strict';

function usageFor(payload, provider) {
  if (provider === 'ollama' && payload.prompt_eval_count !== undefined) {
    return { prompt_tokens: payload.prompt_eval_count, completion_tokens: payload.eval_count };
  }
  return payload.usage || payload.usageMetadata || {};
}

function measuredUsage(usage) {
  const input = usage.input_tokens ?? usage.prompt_tokens ?? usage.promptTokenCount;
  const output = usage.output_tokens ?? usage.completion_tokens ?? usage.candidatesTokenCount;
  return [input, output].every(value => Number.isSafeInteger(value) && value >= 0);
}

module.exports = { usageFor, measuredUsage };
