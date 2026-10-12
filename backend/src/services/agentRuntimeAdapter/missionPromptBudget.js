'use strict';

const ESTIMATE_METHOD = 'ceil_utf8_bytes_div_4';

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

function assertMissionPromptBudget(mission, prompt) {
  const budget = requestedContextBudget(mission);
  if (budget === null) return null;
  const estimatedInputTokens = Math.ceil(Buffer.byteLength(prompt, 'utf8') / 4);
  if (estimatedInputTokens > budget) {
    const error = new Error(`Mission prompt estimate ${estimatedInputTokens} exceeds contextTokenBudget ${budget}.`);
    error.code = 'GENOS_CONTEXT_BUDGET_EXCEEDED';
    error.estimatedInputTokens = estimatedInputTokens;
    error.contextTokenBudget = budget;
    throw error;
  }
  return { estimatedInputTokens, contextTokenBudget: budget, estimateMethod: ESTIMATE_METHOD };
}

module.exports = { assertMissionPromptBudget };
