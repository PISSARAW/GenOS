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
  const validId = (value) => typeof value === 'string' && value.trim();
  if (!validId(spec.experimentId) || !validId(spec.snapshotId) || typeof spec.runner !== 'function') fail('CAUSAL_PROTOCOL_INSUFFICIENT', 'Experiment, snapshot and runner are required.');
}

function validateSeeds(seeds) {
  if (!Array.isArray(seeds) || seeds.length < 3 || seeds.some((seed) => !Number.isSafeInteger(seed)) || new Set(seeds).size !== seeds.length) fail('CAUSAL_SEED_INVALID', 'At least three distinct integer seeds are required.');
}

function validateSharedContext(spec) {
  if (!isRecord(spec.control) || !isRecord(spec.intervention)
    || !isRecord(spec.environmentManifest) || !/^[a-f0-9]{64}$/.test(spec.environmentHash || '')
    || spec.initialState === undefined) {
    fail('CAUSAL_PROTOCOL_INSUFFICIENT', 'Arms, a serializable snapshot and a hashed environment manifest are required.');
  }
  validateSerializableInputs(spec);
  try {
    if (digest(spec.environmentManifest) !== spec.environmentHash) fail('CAUSAL_ENV_DRIFT', 'Environment hash does not match its manifest.');
  } catch (error) {
    if (error.code === 'CAUSAL_ENV_DRIFT') throw error;
    fail('CAUSAL_ENV_DRIFT', 'Environment manifest is not JSON serializable.');
  }
}

function validateSerializableInputs(spec) {
  try {
    for (const value of [spec.initialState, spec.control, spec.intervention]) {
      const serialized = JSON.stringify(value);
      if (typeof serialized !== 'string') throw new Error('Value is not JSON serializable.');
    }
  } catch (_) {
    fail('CAUSAL_SNAPSHOT_MISMATCH', 'Snapshot, arms and environment must be JSON serializable.');
  }
}

function validateBudget(budget, seedCount) {
  if (!Number.isSafeInteger(budget?.maxRuns) || budget.maxRuns < seedCount * 2
    || !Number.isSafeInteger(budget?.maxSteps) || budget.maxSteps < 1) {
    fail('CAUSAL_PROTOCOL_INSUFFICIENT', 'Comparable control and intervention budgets are required.');
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function digest(value) {
  let serialized;
  try { serialized = JSON.stringify(value); } catch (_) { fail('CAUSAL_SNAPSHOT_MISMATCH', 'Value must be JSON serializable before hashing.'); }
  if (typeof serialized !== 'string') fail('CAUSAL_SNAPSHOT_MISMATCH', 'Value must be JSON serializable before hashing.');
  return crypto.createHash('sha256').update(serialized).digest('hex');
}

function clone(value) {
  try { return structuredClone(value); } catch (_) { fail('CAUSAL_SNAPSHOT_MISMATCH', 'Initial snapshot must be serializable.'); }
}

async function runArm({ spec, arm, seed, initialHash }) {
  const state = clone(spec.initialState);
  const isolatedArm = clone(arm);
  if (digest(state) !== initialHash) fail('CAUSAL_SNAPSHOT_MISMATCH', 'Arm did not receive the pinned initial snapshot.');
  let result;
  try {
    result = await spec.runner(isolatedArm, state, {
      seed, budget: spec.budget.maxSteps, environmentHash: spec.environmentHash,
      signal: spec.signal,
    });
  } catch (error) {
    ensureNotAborted(spec.signal);
    fail('CAUSAL_ARM_FAILED', `Arm failed on seed ${seed}: ${error.message}`);
  }
  validateArmResult(result, spec, seed);
  return result;
}

function ensureNotAborted(signal) {
  if (signal?.aborted) fail('CAUSAL_EXPERIMENT_ABORTED', 'Replicated causal experiment was cancelled before completion.');
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
  if (!result || !Number.isFinite(result.metric) || !Array.isArray(result.trajectory)) return false;
  try { return typeof JSON.stringify(result.trajectory) === 'string'; } catch (_) { return false; }
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
  const standardError = Math.sqrt(variance / values.length);
  const criticalValue = pairedT95CriticalValue(values.length);
  const margin = criticalValue * standardError;
  return {
    meanDifference: mean,
    standardError,
    sampleCount: values.length,
    confidenceInterval95: { lower: mean - margin, upper: mean + margin },
    inferenceMethod: 'paired_t_95_assuming_approximately_normal_differences',
  };
}

function pairedT95CriticalValue(sampleCount) {
  const values = [null, null, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262,
    2.228, 2.201, 2.179, 2.160, 2.145, 2.131, 2.120, 2.110, 2.101, 2.093,
    2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045, 2.042];
  return values[sampleCount - 1] || 2.042;
}

function buildReceipt({ spec, snapshotHash, pairs, effect, environmentHash }) {
  const positive = effect.confidenceInterval95.lower > 0;
  const negative = effect.confidenceInterval95.upper < 0;
  const verdict = positive || negative ? 'supported' : 'inconclusive';
  const refs = [`snapshot:${spec.snapshotId}:${snapshotHash}`, `environment:${environmentHash}`, ...(spec.evidenceRefs || [])];
  return createReceipt('CausalInterventionReceipt', {
    experimentId: spec.experimentId, snapshotId: spec.snapshotId,
    control: { label: 'control', budget: spec.budget.maxSteps, meanMetric: pairs.reduce((sum, pair) => sum + pair.control, 0) / pairs.length },
    intervention: { label: 'intervention', budget: spec.budget.maxSteps, meanMetric: pairs.reduce((sum, pair) => sum + pair.intervention, 0) / pairs.length },
    seeds: pairs.map((pair) => pair.seed), replicates: pairs.length,
    metricsBefore: { initialSnapshotHash: snapshotHash, environmentHash, comparableBudget: true },
    metricsAfter: { meanDifference: effect.meanDifference, standardError: effect.standardError },
    pairedEffects: { bySeed: pairs, ...effect },
    verdict, evidenceRefs: refs,
  }, { runId: spec.runId, sourceRefs: refs });
}

async function runReplicatedExperiment(spec, options = {}) {
  validateProtocol(spec);
  ensureNotAborted(options.signal);
  const snapshotHash = digest(spec.initialState);
  const executionSpec = { ...spec, signal: options.signal };
  const pairs = [];
  for (const seed of spec.seeds) {
    ensureNotAborted(options.signal);
    const control = await runArm({ spec: executionSpec, arm: spec.control, seed, initialHash: snapshotHash });
    ensureNotAborted(options.signal);
    const intervention = await runArm({ spec: executionSpec, arm: spec.intervention, seed, initialHash: snapshotHash });
    ensureNotAborted(options.signal);
    pairs.push(pairSeed(seed, control, intervention));
  }
  const effect = summarizePairs(pairs);
  const receipt = buildReceipt({ spec, snapshotHash, pairs, effect, environmentHash: spec.environmentHash });
  if (options.db) await persistReceipt(options.db, receipt, { eventType: 'CAUSAL_EXPERIMENT_VALIDATED' });
  return { schema: 'genos.causal-diff/v1', snapshotHash, environmentHash: spec.environmentHash, pairs, effect, receipt, causalAttribution: 'bounded-to-the-declared-intervention-under-this-protocol' };
}

module.exports = { runReplicatedExperiment, validateProtocol, digest };
