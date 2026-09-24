'use strict';

const assert = require('node:assert/strict');
const { BASELINES } = require('../src/services/morphogenesis/benchmark/morphologyBaselines');
const { runNonStationaryBenchmark } = require('../src/services/morphogenesis/benchmark/nonStationaryBenchmark');
const { calculateLocalRepairRatio, calculateMorphologicalEfficiency, calculateTopologyNecessityPrecision, missionRegret, summarizeMorphologyMetrics } = require('../src/services/morphogenesis/benchmark/morphologyMetrics');

async function run() {
  const seenBudgets = new Set();
  const policies = Object.fromEntries(BASELINES.map((name) => [name, { evaluate: async ({ stage, budget }) => {
    seenBudgets.add(budget);
    return { verifiedGain: stage.step / 10, totalCost: budget / 7 };
  } }]));
  const benchmark = await runNonStationaryBenchmark({ totalBudget: 180, policies });
  assert.equal(benchmark.mission.length, 7);
  assert.equal(benchmark.sequenceConstrained, false, 'the benchmark scores outcomes, not one topology sequence');
  assert.equal(Object.keys(benchmark.policies).length, BASELINES.length);
  assert.equal(seenBudgets.size, 1, 'every baseline receives the same per-policy budget');
  assert.ok(BASELINES.includes('fixed_hindsight_best'), 'hindsight fixed-topology baseline is present');
  assert.equal(calculateMorphologicalEfficiency({ verifiedUsefulProgress: 4, compute: 1, communication: 1, coordination: 1, transitionCost: 1 }), 1);
  assert.equal(calculateLocalRepairRatio({ localRepairs: 3, allRepairs: 4 }), 0.75);
  assert.equal(calculateTopologyNecessityPrecision([{ instantiated: true, marginalValue: 1 }, { instantiated: true, marginalValue: 0 }]), 0.5);
  assert.equal(missionRegret([{ idealUtility: 1, utility: 0.6 }, { idealUtility: 0.5, utility: 0.5 }]).total, 0.4);
  const metrics = summarizeMorphologyMetrics({ successes: 2, missions: 4, reusedWorkers: 3, workersConsidered: 4, transitionCount: 2, unnecessaryTransitions: 1, localRepairs: 2, allRepairs: 4, topologies: [{ instantiated: true, marginalValue: 0.2 }] });
  assert.equal(metrics.successRate, 0.5);
  assert.equal(metrics.workerReuseRate, 0.75);
  assert.equal(metrics.unnecessaryTransitionRate, 0.5);
  assert.equal(metrics.topologyNecessityPrecision, 1);
  console.log('Morphogenesis benchmark and metrics: passed');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
