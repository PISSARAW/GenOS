'use strict';

const modelProvider = require('./modelProvider');
const routingPolicy = require('./modelRoutingPolicy');

function requireBudget(maxCostUsd) {
  if (maxCostUsd == null || !Number.isFinite(Number(maxCostUsd))
    || Number(maxCostUsd) < 0) throw Object.assign(
    new Error('Parallel model review requires an explicit non-negative maxCostUsd budget.'),
    { code: 'MODEL_PARALLEL_BUDGET_REQUIRED' });
}

async function quoteRoute(ctx, uri) {
  const normalized = modelProvider.configuredModel(uri);
  const [, provider, model] = normalized.match(/^([\w-]+):\/\/(.+)$/);
  const row = ctx.db ? await ctx.db.get(`SELECT cost_input, cost_output FROM provider_configs
    WHERE provider = ? AND model = ? AND enabled = 1`, provider, model) : null;
  if (!row && !routingPolicy.isLocalUri(uri)) throw Object.assign(
    new Error('Remote model price is unknown under a cost budget.'),
    { code: 'MODEL_COST_QUOTE_UNAVAILABLE' });
  const prompt = typeof ctx.prompt === 'string' ? ctx.prompt : JSON.stringify(ctx.prompt);
  const inputTokens = modelProvider.estimateTokenCount(prompt);
  const maxOutput = Number(ctx.maxTokens);
  const outputTokens = Number.isFinite(maxOutput) && maxOutput > 0
    ? Math.floor(maxOutput) : 2048;
  return routingPolicy.estimateCostUsd({ costInput: row?.cost_input,
    costOutput: row?.cost_output }, inputTokens, outputTokens);
}

async function requireCapacity(candidates, ctx) {
  requireBudget(ctx.maxCostUsd);
  const quotes = await Promise.all(candidates.map((uri) => quoteRoute(ctx, uri)));
  const total = quotes.reduce((sum, cost) => sum + cost, 0);
  const remaining = Number(ctx.maxCostUsd) - (ctx.spent || 0);
  if (total > remaining + 1e-12) throw Object.assign(
    new Error(`Parallel model reservations ${total} exceed budget ${ctx.maxCostUsd}.`),
    { code: 'MODEL_PARALLEL_COST_BUDGET_EXCEEDED' });
}

module.exports = { requireCapacity };
