'use strict';

function failure(message) {
  return Object.assign(new Error(message), { code: 'BUDGET_EXHAUSTED' });
}

function outputLimit(ctx, inputTokens, requestedOutput) {
  if (ctx.requestTokenBudget === undefined) return requestedOutput;
  const budget = ctx.requestTokenBudget;
  if (!Number.isSafeInteger(budget) || budget <= 0) throw failure('Per-request token budget must be a positive integer.');
  const available = budget - inputTokens;
  if (available <= 0) throw failure(`Estimated complete provider prompt consumes the remaining request budget (${inputTokens} >= ${budget}).`);
  const output = Math.min(requestedOutput, available);
  ctx.maxTokens = output;
  return output;
}

module.exports = { outputLimit };
