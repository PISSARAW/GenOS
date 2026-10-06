'use strict';

function charge(ecology, tokens) {
  const runtime = ecology.ecologicalState.runtime;
  if (!runtime) return;
  if (!Number.isSafeInteger(tokens) || tokens < 0) throw failure('Actual token consumption must be a non-negative integer.', 'BIOME_BUDGET_INVALID');
  const next = runtime.budgetUsed + tokens;
  if (runtime.budgetTotal !== undefined && next > runtime.budgetTotal) throw failure('Actual consumption exceeds the mission budget.', 'BIOME_BUDGET_EXCEEDED');
  runtime.budgetUsed = next;
}

function failure(message, code) { return Object.assign(new Error(message), { code }); }

module.exports = { charge };
