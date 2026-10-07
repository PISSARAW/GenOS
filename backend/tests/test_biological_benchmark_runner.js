'use strict';

const assert = require('node:assert/strict');
const runner = require('../src/services/syncytium/benchmark/biologicalBenchmarkRunnerService');
const { workerLaunchPayload } = require('../bin/workerLaunchPayload.cjs');
const { listPolicies } = require('../src/services/syncytium/variants/variantPolicyRegistry');
const { applySemanticValidation } = require('../src/services/syncytiumMissionCompletionService');

assert.throws(() => runner.validateManifest({ mission: 'x', budget: {}, repetitions: 0, expectedClaims: [] }),
  { code: 'BIOLOGICAL_BENCHMARK_INVALID' });
assert.throws(() => runner.validateManifest({ mission: 'x', budget: {}, repetitions: 1, expectedClaims: [], variantId: 'unknown' }),
  { code: 'BIOLOGICAL_BENCHMARK_INVALID' });
const manifest = { mission: 'x', budget: { tokens: 100, costUsd: 0.02 }, repetitions: 1,
  campaignBudget: { tokens: 1000, costUsd: 0.2 },
  expectedClaims: [{ subject: 'x', predicate: 'safe', value: true }], variantId: 'graph' };
assert.doesNotThrow(() => runner.validateManifest(manifest));
for (const { id } of listPolicies()) {
  const configuration = id === 'humanAi' ? { nuclei: [{ kind: 'human' }] } : undefined;
  assert.doesNotThrow(() => runner.validateManifest({ ...manifest, variantId: id, configuration }),
    `${id} is accepted by the campaign runner`);
}
assert.throws(() => runner.validateManifest({ ...manifest, variantId: 'humanAi' }),
  { code: 'BIOLOGICAL_BENCHMARK_INVALID' });
assert.throws(() => runner.validateManifest({ ...manifest, expectedClaims: [] }), { code: 'BIOLOGICAL_BENCHMARK_INVALID' });
assert.throws(() => runner.validateManifest({ ...manifest, budget: { tokens: 0 } }), { code: 'BIOLOGICAL_BENCHMARK_INVALID' });
assert.throws(() => runner.validateManifest({ ...manifest, campaignBudget: { tokens: 999 } }), { code: 'BIOLOGICAL_BENCHMARK_INVALID' });
assert.throws(() => runner.validateManifest({ ...manifest, budget: { tokens: 100, costUsd: 0.02 }, campaignBudget: { tokens: 1000, costUsd: 0.19 } }), { code: 'BIOLOGICAL_BENCHMARK_INVALID' });
assert.throws(() => runner.validateManifest({ ...manifest, timeoutMs: 120000, scenarioTimeoutMs: 120000 }), { code: 'BIOLOGICAL_BENCHMARK_INVALID' });
const completeOutput = { members: [{ status: 'completed' }, { status: 'completed' }], dispatchFailures: [], stateValidation: { status: 'verified' } };
applySemanticValidation(completeOutput, { status: 'complete', workerCount: 2, coveredWorkers: 2 }, 2);
assert.equal(completeOutput.complete, true);
const partialOutput = { members: [{ status: 'error' }], dispatchFailures: [{ role: 'guardian', reason: 'worker_status_error' }] };
applySemanticValidation(partialOutput, { status: 'complete', workerCount: 1, coveredWorkers: 1 }, 2);
assert.equal(partialOutput.complete, false);
assert.equal(partialOutput.status, 'partial');
assert.equal(partialOutput.semanticValidation.status, 'incomplete');
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
