'use strict';

const assert = require('node:assert/strict');
const benchmark = require('../src/services/syncytium/benchmark/syncytiumBenchmarkService');
const syncytium = require('../src/services/syncytiumCoordinationService');

function main() {
  const metrics = benchmark.calculateMetrics({
    semanticConflictsMissed: 2, realSemanticConflicts: 10,
    safeOperationsWithoutCoordination: 8, safeOperationsEligible: 10,
    violationsPromotedOutsideSyncytium: 0, invariantViolations: 4,
    relevantUpdatesDelivered: 75, allUpdatesDelivered: 100
  });
  assert.equal(metrics.undetectedSemanticConflictRate.value, 0.2);
  assert.equal(metrics.coordinationAvoidanceRatio.value, 0.8);
  assert.equal(metrics.invariantViolationEscapeRate.value, 0);
  assert.equal(metrics.relevantSynchronizationEfficiency.value, 0.75);
  assert.equal(benchmark.calculateMetrics().invariantViolationEscapeRate.measured, false);
  assert.throws(() => benchmark.calculateMetrics({ invariantViolations: 1, violationsPromotedOutsideSyncytium: 2 }),
    (error) => error.code === 'SYNCYTIUM_BENCHMARK_INVALID');
  assert.throws(() => benchmark.compareRuns([
    { variant: 'syncytium', task: 'migration', budget: { tokens: 500 }, counts: {} }
  ]), (error) => error.code === 'SYNCYTIUM_BENCHMARK_INVALID');

  const comparison = benchmark.compareRuns([
    { variant: 'syncytium', task: 'migration', budget: { tokens: 500 }, counts: completeCounts(1) },
    { variant: 'a_team', task: 'migration', budget: { tokens: 500 }, counts: completeCounts(2) }
  ]);
  assert.equal(comparison.equalBudget, true);
  assert.equal(comparison.variants.syncytium.metrics.undetectedSemanticConflictRate.value, 0.25);
  assert.equal(syncytium.evaluateMorphogenesisBenchmarks([
    { variant: 'syncytium', task: 'migration', budget: { tokens: 500 }, counts: completeCounts(1) }
  ]).variants.syncytium.runCount, 1);
  console.log('Syncytium benchmark metric checks: PASS');
}

function completeCounts(missed) {
  return {
    semanticConflictsMissed: missed, realSemanticConflicts: 4,
    safeOperationsWithoutCoordination: 5, safeOperationsEligible: 10,
    violationsPromotedOutsideSyncytium: 0, invariantViolations: 1,
    relevantUpdatesDelivered: 8, allUpdatesDelivered: 10
  };
}

main();
