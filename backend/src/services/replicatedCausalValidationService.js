'use strict';

const crypto = require('node:crypto');
const { createReceipt } = require('./versionedContractService');
const { persistReceipt } = require('./versionedContractPersistenceService');

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function validateProtocol(spec) {
  validateExperimentIdentity(spec);
  validateSeeds(spec.seeds);
  validateSharedContext(spec);
  validateBudget(spec.budget, spec.seeds.length);
}

function validateExperimentIdentity(spec) {
  if (!spec.experimentId || !spec.snapshotId || typeof spec.runner !== 'function') fail('CAUSAL_PROTOCOL_INSUFFICIENT', 'Experiment, snapshot and runner are required.');
}

function validateSeeds(seeds) {
  if (!Array.isArray(seeds) || seeds.length < 3 || seeds.some((seed) => !Number.isSafeInteger(seed)) || new Set(seeds).size !== seeds.length) fail('CAUSAL_SEED_INVALID', 'At least three distinct integer seeds are required.');
}

function validateSharedContext(spec) {
  if (!spec.control || !spec.intervention || !/^[a-f0-9]{64}$/.test(spec.environmentHash || '') || !spec.environmentManifest || spec.initialState === undefined) fail('CAUSAL_PROTOCOL_INSUFFICIENT', 'Arms, a serializable snapshot and a hashed environment manifest are required.');
  if (digest(spec.environmentManifest) !== spec.environmentHash) fail('CAUSAL_ENV_DRIFT', 'Environment hash does not match its manifest.');
}

function validateBudget(budget, seedCount) {
  if (!Number.isInteger(budget?.maxRuns) || budget.maxRuns < seedCount * 2 || !Number.isInteger(budget?.maxSteps) || budget.maxSteps < 1) fail('CAUSAL_PROTOCOL_INSUFFICIENT', 'Comparable control and intervention budgets are required.');
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function clone(value) {
  try { return structuredClone(value); } catch (_) { fail('CAUSAL_SNAPSHOT_MISMATCH', 'Initial snapshot must be serializable.'); }
}

async function runArm({ spec, arm, seed, initialHash }) {
  const state = clone(spec.initialState);
  if (digest(state) !== initialHash) fail('CAUSAL_SNAPSHOT_MISMATCH', 'Arm did not receive the pinned initial snapshot.');
  let result;
  try {
    result = await spec.runner(arm, state, { seed, budget: spec.budget.maxSteps, environmentHash: spec.environmentHash });
  } catch (error) {
    fail('CAUSAL_ARM_FAILED', `Arm failed on seed ${seed}: ${error.message}`);
  }
  validateArmResult(result, spec, seed);
  return result;
}

function validateArmResult(result, spec, seed) {
  if (!validArmContext(result, spec, seed) || !validArmMeasurement(result) || !validArmBudget(result, spec)) {
    fail('CAUSAL_ENV_DRIFT', 'Arm output did not confirm its seed, environment and finite measured trajectory.');
  }
}

function validArmContext(result, spec, seed) {
  return Boolean(result) && result.seed === seed && result.environmentHash === spec.environmentHash;
}

function validArmMeasurement(result) {
  return Boolean(result) && Number.isFinite(result.metric) && Array.isArray(result.trajectory);
}

function validArmBudget(result, spec) {
  return Boolean(result) && Number.isInteger(result.steps) && result.steps >= 0 && result.steps <= spec.budget.maxSteps;
}

function pairSeed(seed, control, intervention) {
  const difference = intervention.metric - control.metric;
  const length = Math.max(control.trajectory.length, intervention.trajectory.length);
  const divergences = [];
  for (let index = 0; index < length; index += 1) {
    const controlHasStep = index < control.trajectory.length;
    const interventionHasStep = index < intervention.trajectory.length;
    if (!controlHasStep || !interventionHasStep
      || JSON.stringify(control.trajectory[index]) !== JSON.stringify(intervention.trajectory[index])) {
      divergences.push(index);
    }
  }
  return {
    seed,
    control: control.metric,
    intervention: intervention.metric,
    difference,
    controlTrajectoryLength: control.trajectory.length,
    interventionTrajectoryLength: intervention.trajectory.length,
    divergenceSteps: divergences,
  };
}

function summarizePairs(pairs) {
  const values = pairs.map((pair) => pair.difference);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return { meanDifference: mean, standardError: Math.sqrt(variance / values.length), sampleCount: values.length };
}

function buildReceipt({ spec, snapshotHash, pairs, effect, environmentHash }) {
  const positive = effect.meanDifference > 2 * effect.standardError;
  const negative = effect.meanDifference < -2 * effect.standardError;
  const verdict = positive || negative ? 'supported' : 'inconclusive';
  const refs = [`snapshot:${spec.snapshotId}:${snapshotHash}`, `environment:${environmentHash}`, ...(spec.evidenceRefs || [])];
  return createReceipt('CausalInterventionReceipt', {
    experimentId: spec.experimentId, snapshotId: spec.snapshotId,
    control: { label: 'control', budget: spec.budget.maxSteps, meanMetric: pairs.reduce((sum, pair) => sum + pair.control, 0) / pairs.length },
    intervention: { label: 'intervention', budget: spec.budget.maxSteps, meanMetric: pairs.reduce((sum, pair) => sum + pair.intervention, 0) / pairs.length },
    seeds: pairs.map((pair) => pair.seed), replicates: pairs.length,
    metricsBefore: { initialSnapshotHash: snapshotHash, environmentHash, comparableBudget: true },
    metricsAfter: { meanDifference: effect.meanDifference, standardError: effect.standardError },
    pairedEffects: { bySeed: pairs, meanDifference: effect.meanDifference, standardError: effect.standardError },
    verdict, evidenceRefs: refs,
  }, { runId: spec.runId, sourceRefs: refs });
}

async function runReplicatedExperiment(spec, options = {}) {
  validateProtocol(spec);
  const snapshotHash = digest(spec.initialState);
  const pairs = [];
  for (const seed of spec.seeds) {
    const control = await runArm({ spec, arm: spec.control, seed, initialHash: snapshotHash });
    const intervention = await runArm({ spec, arm: spec.intervention, seed, initialHash: snapshotHash });
    pairs.push(pairSeed(seed, control, intervention));
  }
  const effect = summarizePairs(pairs);
  if (effect.meanDifference === 0 && effect.standardError === 0) fail('CAUSAL_NO_MEASURABLE_EFFECT', 'The paired experiment measured no effect.');
  const receipt = buildReceipt({ spec, snapshotHash, pairs, effect, environmentHash: spec.environmentHash });
  if (options.db) await persistReceipt(options.db, receipt, { eventType: 'CAUSAL_EXPERIMENT_VALIDATED' });
  return { schema: 'genos.causal-diff/v1', snapshotHash, environmentHash: spec.environmentHash, pairs, effect, receipt, causalAttribution: 'bounded-to-the-declared-intervention-under-this-protocol' };
}

module.exports = { runReplicatedExperiment, validateProtocol, digest };
