'use strict';

const assert = require('node:assert/strict');
const runner = require('../src/services/syncytium/benchmark/biologicalBenchmarkRunnerService');
const { workerLaunchPayload } = require('../bin/workerLaunchPayload.cjs');

assert.throws(() => runner.validateManifest({ mission: 'x', budget: {}, repetitions: 0, expectedClaims: [] }),
  { code: 'BIOLOGICAL_BENCHMARK_INVALID' });
assert.throws(() => runner.validateManifest({ mission: 'x', budget: {}, repetitions: 1, expectedClaims: [], variantId: 'unknown' }),
  { code: 'BIOLOGICAL_BENCHMARK_INVALID' });
assert.doesNotThrow(() => runner.validateManifest({ mission: 'x', budget: {}, repetitions: 1, expectedClaims: [], variantId: 'graph' }));
assert.deepEqual(runner.qualityScore([], []), {
  expectedClaims: 0, matchedClaims: 0, value: null, measured: false
});
assert.equal(runner.qualityScore(
  [{ subject: 'avatar', predicate: 'required', value: true }],
  [{ subject: 'avatar', predicate: 'required', value: true }]
).value, 1);
const measured = runner.metricCounts({
  validation: { conflicts: [{}, {}] }, runtimeValidation: { conflicts: [{}] }, baseline: false
});
assert.equal(measured.semanticConflictsMissed, 1);
assert.equal(measured.realSemanticConflicts, 2);

const payload = workerLaunchPayload({
  context: { orchestratorId: 'orch', task: 'mission', request: { mode: 'isolated_baseline' } },
  member: { role: 'parallel_executor', mission: 'Execute independently.' },
  workerId: 'worker', parent: {}
});
assert.match(payload.mission, /ISOLATED BASELINE/);
assert.doesNotMatch(payload.mission, /genos_topology_session/);

console.log('Biological benchmark runner checks: PASS');
