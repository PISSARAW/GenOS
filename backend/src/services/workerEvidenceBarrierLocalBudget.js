/**
 * Budget prompt du worker local : estimation et garde pre-generation.
 * Extrait de workerEvidenceBarrierLocal.js (gate LINES 400).
 */

function estimatePromptTokens(prompt) {
  return Math.ceil(Buffer.byteLength(String(prompt), 'utf8') / 4);
}

function resolveTokenBudget(mission) {
  if (!mission) return 0;
  if (!mission.executionBudget) return 0;
  return Number(mission.executionBudget.tokens);
}

function promptBudgetError(estimate, budget) {
  return Object.assign(new Error('Local worker prompt consumes its token budget before generation (' + String(estimate) + ' >= ' + String(budget) + ').'), { code: 'BUDGET_EXHAUSTED' });
}

function throwIfPromptOverBudget(estimate, budget) {
  if (budget <= 0) return;
  if (estimate < budget) return;
  throw promptBudgetError(estimate, budget);
}

function consumedTokensOf(result) {
  return Number(result.inputTokens) + Number(result.outputTokens);
}

function throwIfConsumedOverBudget(consumed, budget) {
  if (budget <= 0 || consumed <= budget) return;
  throw Object.assign(new Error('Local worker consumed ' + String(consumed)
    + ' tokens above its ' + String(budget) + '-token budget.'), { code: 'BUDGET_EXHAUSTED' });
}

module.exports = { estimatePromptTokens, resolveTokenBudget, throwIfPromptOverBudget,
  consumedTokensOf, throwIfConsumedOverBudget };
