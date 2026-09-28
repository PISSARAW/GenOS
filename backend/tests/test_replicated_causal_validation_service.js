'use strict';

const assert = require('node:assert/strict');
const { runReplicatedExperiment, digest } = require('../src/services/replicatedCausalValidationService');

const environmentManifest = { runtime: 'node-test', dependencies: 'locked-test-fixture' };
const environmentHash = digest(environmentManifest);

function spec(runner) {
  return {
    experimentId: 'causal-01', snapshotId: 'snapshot-01', initialState: { value: 0 },
    environmentHash, environmentManifest, seeds: [3, 7, 11], budget: { maxRuns: 6, maxSteps: 2 },
    control: { delta: 0 }, intervention: { delta: 2 }, evidenceRefs: ['protocol:causal-v1'], runner,
  };
}

async function main() {
  const runner = async (arm, state, context) => {
    state.value += arm.delta;
    return { seed: context.seed, environmentHash: context.environmentHash, metric: state.value, trajectory: [state.value], steps: 1 };
  };
  const result = await runReplicatedExperiment(spec(runner));
  assert.equal(result.pairs.length, 3);
  assert.equal(result.effect.meanDifference, 2);
  assert.deepEqual(result.pairs.map((pair) => pair.divergenceSteps), [[0], [0], [0]]);
  assert.equal(result.receipt.payload.verdict, 'supported');
  assert.equal(result.receipt.payload.metricsBefore.comparableBudget, true);
  const unequalTrajectories = await runReplicatedExperiment(spec(async (arm, state, context) => {
    state.value += arm.delta;
    return {
      seed: context.seed,
      environmentHash: context.environmentHash,
      metric: arm.delta,
      trajectory: arm.delta ? [0, state.value] : [0],
      steps: 1,
    };
  }));
  assert.deepEqual(unequalTrajectories.pairs[0].divergenceSteps, [1]);
  assert.equal(unequalTrajectories.pairs[0].controlTrajectoryLength, 1);
  assert.equal(unequalTrajectories.pairs[0].interventionTrajectoryLength, 2);
  const noisy = await runReplicatedExperiment(spec(async (arm, state, context) => {
    state.value += arm.delta * (context.seed === 11 ? 50 : 1);
    return {
      seed: context.seed,
      environmentHash: context.environmentHash,
      metric: state.value,
      trajectory: [state.value],
      steps: 1,
    };
  }));
  assert.ok(noisy.pairs.every((pair) => pair.difference > 0));
  assert.equal(noisy.receipt.payload.verdict, 'inconclusive');
  await assert.rejects(() => runReplicatedExperiment({ ...spec(runner), seeds: [3, 3, 7] }), { code: 'CAUSAL_SEED_INVALID' });
  await assert.rejects(() => runReplicatedExperiment(spec(async () => ({ seed: 1, environmentHash: 'b'.repeat(64), metric: 0, trajectory: [], steps: 0 }))), { code: 'CAUSAL_ENV_DRIFT' });
  await assert.rejects(() => runReplicatedExperiment(spec(async () => { throw new Error('arm failed'); })), { code: 'CAUSAL_ARM_FAILED' });
  console.log('Replicated causal validation: paired seeds, isolated snapshots, environment drift and failures passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
