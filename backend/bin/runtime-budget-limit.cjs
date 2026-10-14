'use strict';

const DEFAULT_BUDGETS = { tokens: 100000, costUsd: 1, latencyMs: 60000, events: 100 };

function budgetLimit(executionBudget, key) {
  const raw = executionBudget?.[key];
  if (raw === undefined) return DEFAULT_BUDGETS[key] ?? 0;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

module.exports = { budgetLimit };
