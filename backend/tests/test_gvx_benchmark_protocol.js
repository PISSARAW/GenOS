'use strict';

const assert = require('assert');
const protocol = require('../src/services/gvxBenchmarkProtocol');

function design() {
  return {
    modelLock: 'fixed-model-v1', toolsetHash: 'fixed-tools-v1', budgetPerRun: 100, minSeeds: 2,
    analysisPlan: { primaryMetric: 'transfer', direction: 'higher' },
    powerPlan: { minimumEffectOfInterest: 0.1, confidenceLevel: 0.95, power: 0.8, assumedStdDev: 0.1 },
    variants: protocol.VARIANTS, cohorts: protocol.COHORTS, metrics: protocol.METRICS,
    datasets: { trainHash: 'a'.repeat(64), heldOutHash: 'b'.repeat(64) },
    experiments: { twinOntogenesis: true, substrateTransplant: true, ablations: ['trinity', 'fossils', 'plasmids'] }
  };
}

function run(input) {
  const { variant, split, metricValue, seed } = input;
  return {
    variant, cohort: 'software', split,
    datasetHash: split === 'train' ? 'a'.repeat(64) : 'b'.repeat(64),
    seed, artifactHash: 'c'.repeat(64), cost: 42,
    metrics: Object.fromEntries(protocol.METRICS.map((metric) => [metric, metricValue]))
  };
}

const manifest = protocol.createManifest(design());
assert.strictEqual(manifest.requiredReplicates, 16);
const runs = protocol.VARIANTS.flatMap((variant) => protocol.COHORTS.flatMap((cohort) =>
  ['train', 'held_out'].flatMap((split) => Array.from({ length: manifest.requiredReplicates }, (_, index) => index + 1).map((seed) => ({
    ...run({ variant, split, metricValue: variant === 'gvx' ? 0.6 : 0.5, seed }), cohort
  }))
)));
const score = protocol.scoreBenchmark(manifest, runs);
assert.strictEqual(score.comparisonAuthority, 'none');
assert.ok(Math.abs(score.heldOutGroups.gvx.software.metrics.transfer.mean - 0.6) < 1e-9);
assert.ok(score.heldOutGroups.gvx.software.metrics.transfer.standardError !== null);
assert.strictEqual(score.heldOutGroups.gvX, undefined);
assert.throws(() => protocol.createManifest({ ...design(), experiments: {} }), { code: 'GVX_BENCHMARK_INVALID' });
assert.throws(() => protocol.scoreBenchmark(manifest, [run({ variant: 'gvx', split: 'held_out', metricValue: 0.6, seed: 1 })]), { code: 'GVX_BENCHMARK_RUN_INVALID' });
console.log('GVX benchmark protocol checks passed.');
