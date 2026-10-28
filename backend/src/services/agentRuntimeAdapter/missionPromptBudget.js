'use strict';

const ESTIMATE_METHOD = 'ceil_utf8_bytes_div_4';
const MESSAGE_ESTIMATE_METHOD = 'ceil_utf8_bytes_div_4_per_message';

function estimateInputTokens(parts) {
  return parts.reduce((total, part) => total + Math.ceil(Buffer.byteLength(String(part || ''), 'utf8') / 4), 0);
}

function requestedContextBudget(mission) {
  const value = mission.contextTokenBudget;
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) {
    const error = new Error('contextTokenBudget must be an integer between 0 and 4294967295.');
    error.code = 'GENOS_CONTEXT_BUDGET_INVALID';
    throw error;
  }
  return value;
}

function assertMissionPromptBudget(mission, prompt, additionalInput = '') {
  const budget = requestedContextBudget(mission);
  if (budget === null) return null;
  const estimatedInputTokens = estimateInputTokens([prompt, additionalInput]);
  if (estimatedInputTokens > budget) {
    const error = new Error(`Mission input estimate ${estimatedInputTokens} exceeds contextTokenBudget ${budget}.`);
    error.code = 'GENOS_CONTEXT_BUDGET_EXCEEDED';
    error.estimatedInputTokens = estimatedInputTokens;
    error.contextTokenBudget = budget;
    throw error;
  }
  return { estimatedInputTokens, contextTokenBudget: budget,
    estimateMethod: additionalInput ? MESSAGE_ESTIMATE_METHOD : ESTIMATE_METHOD };
}

module.exports = { assertMissionPromptBudget, estimateInputTokens };
