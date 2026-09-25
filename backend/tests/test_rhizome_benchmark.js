'use strict';

const assert = require('node:assert/strict');
const benchmark = require('../src/services/rhizome/analytics/benchmarkSuite');

function run() {
  const result = benchmark.runSuite();
  assert.equal(result.budgetUnits, 8);
  assert.equal(result.scenarios.find((item) => item.name === 'fixed_dag').recovered, false);
  assert.equal(result.scenarios.find((item) => item.name === 'rhizome_redundant').recovered, true);
  assert.equal(result.scenarios.find((item) => item.name === 'verified_growth').usefulGrowth, true);
  assert.equal(result.comparisons.lookupReportsCapabilityWithoutPath, true);
  assert.equal(result.comparisons.growthPrecision, 1);
  assert.equal(result.comparisons.redundantGraphRecoversEverySingleEdgeFailure, true);
  assert.equal(result.comparisons.doubleIndependentFailuresExhaustRedundancy, true);
  assert.ok(result.scenarios.every((scenario) => scenario.budgetUnits === result.budgetUnits));
  console.log(JSON.stringify(result, null, 2));
}

run();
