'use strict';

const METRICS = Object.freeze({
  undetectedSemanticConflictRate: ['semanticConflictsMissed', 'realSemanticConflicts'],
  coordinationAvoidanceRatio: ['safeOperationsWithoutCoordination', 'safeOperationsEligible'],
  invariantViolationEscapeRate: ['violationsPromotedOutsideSyncytium', 'invariantViolations'],
  relevantSynchronizationEfficiency: ['relevantUpdatesDelivered', 'allUpdatesDelivered']
});

function calculateMetrics(counts = {}) {
  return Object.fromEntries(Object.entries(METRICS).map(([name, fields]) => [name, ratio(counts, fields)]));
}

function ratio(counts, fields) {
  const numerator = optionalCount(counts[fields[0]], fields[0]);
  const denominator = optionalCount(counts[fields[1]], fields[1]);
  if (numerator === null || denominator === null || denominator === 0) {
    return { numerator, denominator, value: null, measured: false };
  }
  if (numerator > denominator) throw invalidCount(`${fields[0]} cannot exceed ${fields[1]}.`);
  return { numerator, denominator, value: numerator / denominator, measured: true };
}

function compareRuns(runs) {
  if (!Array.isArray(runs) || !runs.length) throw invalidCount('At least one benchmark run is required.');
  const grouped = new Map();
  const budgetsByTask = new Map();
  for (const run of runs) addRun({ run, grouped, budgetsByTask });
  return {
    equalBudget: [...budgetsByTask.values()].every((budgets) => new Set(budgets).size <= 1),
    variants: Object.fromEntries([...grouped].map(([variant, counts]) => [variant, {
      runCount: counts.runCount, counts: counts.total, metrics: calculateMetrics(counts.total)
    }]))
  };
}

function addRun(context) {
  const { run, grouped, budgetsByTask } = context;
  const details = validateRun(run);
  rememberBudget(budgetsByTask, details.task, details.signature);
  const aggregate = ensureAggregate(grouped, details.variant);
  aggregate.runCount += 1;
  addCounts(aggregate.total, run.counts);
}

function validateRun(run) {
  const variant = String(run?.variant || '').trim();
  const task = String(run?.task || '').trim();
  if (!variant || !task || !run.budget || !run.counts) throw invalidCount('Each run needs variant, task, budget, and counts.');
  for (const field of Object.values(METRICS).flat()) countValue(run.counts[field], field);
  return { variant, task, signature: JSON.stringify(sortObject(run.budget)) };
}

function rememberBudget(budgets, task, signature) {
  if (!budgets.has(task)) budgets.set(task, []);
  budgets.get(task).push(signature);
}

function ensureAggregate(grouped, variant) {
  if (!grouped.has(variant)) grouped.set(variant, { runCount: 0, total: emptyCounts() });
  return grouped.get(variant);
}

function addCounts(total, counts) {
  for (const field of Object.values(METRICS).flat()) total[field] += countValue(counts[field], field);
}

function emptyCounts() {
  return Object.fromEntries([...new Set(Object.values(METRICS).flat())].map((field) => [field, 0]));
}

function countValue(value, field) {
  if (value === undefined || value === null) throw invalidCount(`${field} is required.`);
  const count = Number(value);
  if (!Number.isSafeInteger(count) || count < 0) throw invalidCount(`${field} must be a non-negative integer.`);
  return count;
}

function optionalCount(value, field) {
  return value === undefined || value === null ? null : countValue(value, field);
}

function sortObject(value) {
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)));
}

function invalidCount(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_BENCHMARK_INVALID' });
}

module.exports = { METRICS, calculateMetrics, compareRuns };
