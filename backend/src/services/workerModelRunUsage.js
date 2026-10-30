'use strict';

function measured(row) {
  return row.token_usage_source === 'provider'
    && [row.input_tokens, row.output_tokens].every((value) => Number.isSafeInteger(value) && value >= 0);
}

function sumUsage(rows) {
  const input = rows.reduce((sum, row) => sum + row.input_tokens, 0);
  const output = rows.reduce((sum, row) => sum + row.output_tokens, 0);
  const costs = rows.map((row) => row.cost_usd);
  return { input_tokens: input, output_tokens: output, tokens: input + output,
    ...(costs.every((value) => Number.isFinite(value) && value >= 0)
      ? { cost_usd: costs.reduce((sum, value) => sum + value, 0) } : {}) };
}

function attribution(rows) {
  return [...new Set(rows.map((row) => row.model))].map((model) => {
    const attempts = rows.filter((row) => row.model === model);
    return { model, provider: model.split('://')[0], attemptIds: attempts.map((row) => row.id),
      usage: sumUsage(attempts) };
  });
}

async function forRun(ctx) {
  if (!ctx.db?.all) return {};
  const rows = await ctx.db.all(`SELECT id, model, provider_called, token_usage_source,
    input_tokens, output_tokens, cost_usd FROM model_attempt_ledger
    WHERE mission_id = ? AND agent_id = ? ORDER BY rowid`, ctx.executionRun.id, ctx.mission.agentId);
  if (!rows.length) return {};
  const called = rows.filter((row) => row.provider_called === 1);
  const known = called.filter(measured);
  const unknown = called.filter((row) => !measured(row)).map((row) => row.id);
  return { usage: known.length ? sumUsage(known) : undefined,
    modelUsageAccounting: { scope: 'execution_run_measured_total', executionRunId: ctx.executionRun.id,
      complete: unknown.length === 0, unmeasuredAttemptIds: unknown, byModel: attribution(known) } };
}

function metricDelta(total, previous) {
  return Object.fromEntries(Object.entries(total).map(([key, value]) =>
    [key, Math.max(0, value - Number(previous[key] || 0))]));
}

module.exports = { forRun, metricDelta };
