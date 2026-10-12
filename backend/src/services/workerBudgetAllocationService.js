'use strict';

function splitBudget(value, index, assignments) {
  const total = Number(value);
  if (!Number.isFinite(total) || total <= 0) return undefined;
  const count = Math.max(1, Math.floor(assignments) || 1);
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  const bonusSlots = Math.floor(remainder);
  const fractional = remainder - bonusSlots;
  const bonus = index < bonusSlots ? 1 : 0;
  const extra = index === 0 ? fractional : 0;
  return Number((base + bonus + extra).toFixed(6));
}

function buildExecutionBudget(details) {
  const { executionBudget, assignedTokens, index, assignmentCount } = details;
  const costUsd = executionBudget?.costUsd === undefined ? undefined
    : Math.floor(Number(executionBudget.costUsd) * 1000000 / assignmentCount) / 1000000;
  const events = splitBudget(executionBudget?.events, index, assignmentCount);
  return { ...executionBudget, tokens: assignedTokens,
    ...(costUsd === undefined ? {} : { costUsd }),
    ...(events === undefined ? {} : { events }) };
}

module.exports = { buildExecutionBudget, splitBudget };
