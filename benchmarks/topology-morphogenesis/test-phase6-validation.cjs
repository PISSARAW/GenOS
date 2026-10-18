'use strict';

const assert = require('node:assert/strict');
const { qualifyPhase6Validation } = require('./phase6Validation.cjs');

function receipt(environmentId) {
  return { verified: true, realExecution: true, evidenceRef: `sha256:${environmentId}`,
    observedAt: '2026-10-18T11:00:00.000Z' };
}

function input() {
  const replications = ['alpha', 'beta'].flatMap(taskFamily => [1, 2, 3].flatMap(seed => [
    { taskFamily, seed, modelId: 'model-v2', score: 1, cost: 1, oracleVerified: true, executionVerified: true, budgetExceeded: false },
    { taskFamily, seed, modelId: 'model-v2', score: 0.8, cost: 1, oracleVerified: true, executionVerified: true, budgetExceeded: false }
  ]));
  return {
    campaignId: 'phase6-validation', phase: 'validation', sourceClean: true,
    p5: { status: 'qualified', universalGeneralization: false },
    plan: { requiredSeeds: 3, requiredTaskFamilies: 2, maxFailureRate: 0.1, maxCostOverhead: 0.1 },
    environments: [{ environmentId: 'kubernetes', receipt: receipt('kubernetes') },
      { environmentId: 'cloud', receipt: receipt('cloud') }],
    externalWorkers: [{ workerId: 'trinity-real', receipt: receipt('trinity') },
      { workerId: 'a-team-real', receipt: receipt('a-team') }],
    distributedParity: { verified: true, processCount: 3, deploymentCount: 2,
      networkTopologies: ['sqlite-wal', 'grpc'] },
    rustToolchain: { verified: true, nasmVisible: true, msvcReady: true, cargoBuild: 'passed' },
    replications,
    environmentEffects: [{ environmentId: 'kubernetes', lower: 0.08, upper: 0.22, costOverhead: 0.04, guardrailsPreserved: true },
      { environmentId: 'cloud', lower: 0.05, upper: 0.2, costOverhead: 0.06, guardrailsPreserved: true }]
  };
}

function run() {
  const eligible = qualifyPhase6Validation(input());
  assert.equal(eligible.status, 'eligible');
  assert.equal(eligible.crossEnvironmentAdvantage, true);
  assert.equal(eligible.universalGeneralization, false);
  assert.equal(eligible.runtimePromotionAuthorized, false);
  assert.equal(eligible.summary.attemptCount, 12);
  assert.deepEqual(eligible.scope.seeds, ['1', '2', '3']);

  const blocked = qualifyPhase6Validation({ ...input(), rustToolchain: { verified: false } });
  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.blockers.includes('rust_toolchain_unverified'));

  const failed = qualifyPhase6Validation({ ...input(), replications: [{ taskFamily: 'alpha', seed: 1,
    score: 0, oracleVerified: false, executionVerified: true, budgetExceeded: true }] });
  assert.ok(failed.blockers.includes('seed_coverage_incomplete'));
  assert.ok(failed.blockers.includes('replication_failure_rate_exceeded'));
  console.log('Phase 6 bounded robustness and external validation gate: PASS');
}

run();
