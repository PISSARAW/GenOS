'use strict';

const assert = require('node:assert/strict');
const benchmark = require('../src/services/rhizome/analytics/benchmarkSuite');

function run() {
  const result = benchmark.runSuite();
  assert.equal(result.budgetLimit, 80);
  assert.equal(result.scenarios.find((item) => item.name === 'fixed_dag').recovered, false);
  assert.equal(result.scenarios.find((item) => item.name === 'rhizome_redundant').recovered, true);
  assert.equal(result.scenarios.find((item) => item.name === 'verified_growth').usefulGrowth, true);
  assert.equal(result.comparisons.lookupReportsCapabilityWithoutPath, true);
  assert.equal(result.comparisons.growthPrecision, 1);
  assert.equal(result.comparisons.redundantGraphRecoversEverySingleEdgeFailure, true);
  assert.equal(result.comparisons.doubleIndependentFailuresExhaustRedundancy, true);
  assert.ok(result.scenarios.every((scenario) => scenario.budgetLimit === result.budgetLimit && scenario.withinBudget));
  assert.ok(result.scenarios.every((scenario) => Number.isInteger(scenario.budgetUsed) && scenario.budgetUsed <= scenario.budgetLimit));
  console.log(JSON.stringify(result, null, 2));
}

run();
