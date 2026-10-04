'use strict';

function normalizeFinite(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function calculateInheritedCognitiveBudget(parentBudget, workerShare, workerCount) {
  const parent = Math.max(0, normalizeFinite(parentBudget ?? 100, 100));
  const share = Math.max(0, Math.min(1, normalizeFinite(workerShare ?? 0.6, 0.6)));
  const count = Math.max(1, Math.floor(normalizeFinite(workerCount, 1)));
  return (parent * share) / count;
}

module.exports = { calculateInheritedCognitiveBudget };
