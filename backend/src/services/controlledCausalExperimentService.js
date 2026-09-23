'use strict';

const EVIDENCE_LEVELS = Object.freeze({
  STRONG: 'strong',
  MODERATE: 'moderate',
  WEAK: 'weak',
  NONE: 'none',
});

function createExperiment({ name = 'unnamed', runner, control, intervention, initialState }) {
  if (typeof runner !== 'function') throw new Error('ControlledCausalExperiment requires a runner function');
  if (initialState === undefined) throw new Error('ControlledCausalExperiment requires an explicit initialState');

  return {
    name,
    runner,
    control,
    intervention,
    initialState,
    executedAt: null,
    baseline: null,
    candidate: null,
    receipt: null,
  };
}

function cloneState(state) {
  if (state === undefined) return undefined;
  if (typeof structuredClone === 'function') return structuredClone(state);
  return JSON.parse(JSON.stringify(state));
}

function stateHash(state) {
  const crypto = require('crypto');
  const payload = JSON.stringify(state ?? null);
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

function executeBaseline(experiment) {
  const state = cloneState(experiment.initialState);
  return experiment.runner(experiment.control, state);
}

function executeIntervention(experiment) {
  const state = cloneState(experiment.initialState);
  return experiment.runner(experiment.intervention, state);
}

function compareTrajectories(baselineTrajectory, candidateTrajectory) {
  const divergences = findDivergencePoints(baselineTrajectory, candidateTrajectory);
  const lengthDiverged = baselineTrajectory.length !== candidateTrajectory.length;
  return {
    diverged: divergences.length > 0 || lengthDiverged,
    divergenceCount: divergences.length,
    lengthDiverged,
    firstDivergence: divergences.length ? divergences[0] : null,
    baselineLength: baselineTrajectory.length,
    candidateLength: candidateTrajectory.length,
  };
}

function findDivergencePoints(baseline, candidate) {
  const divergences = [];
  // Only compare positions that exist in both trajectories.
  // A length difference is itself a divergence — surfaced as
  // lengthDiverged/diverged by compareTrajectories.
  const minLen = Math.min(baseline.length, candidate.length);
  for (let i = 0; i < minLen; i++) {
    if (baseline[i] !== candidate[i]) {
      divergences.push({ step: i, baseline: baseline[i], candidate: candidate[i] });
    }
  }
  return divergences;
}

function buildCausalReceipt({ experiment, baselineResult, candidateResult, baselineTrajectory, candidateTrajectory, trajectoryComparison, controlInitialStateHash, interventionInitialStateHash }) {
  const initialStatesEqual = controlInitialStateHash === interventionInitialStateHash;
  const controls = {
    initialStatesEqual,
    replicated: false,
    sameSeed: 'unverified',
    sameEnvironment: 'unverified',
    sameDependencies: 'unverified',
  };
  const controlsProven = false;
  const trajectoryEvidenceStrength = assessEvidenceStrength({
    divergenceCount: trajectoryComparison.divergenceCount,
    lengthDiverged: trajectoryComparison.lengthDiverged,
    baselineLength: baselineTrajectory.length,
    candidateLength: candidateTrajectory.length,
    controlsProven,
  });

  return {
    experimentName: experiment.name,
    executedAt: Date.now(),
    control: experiment.control,
    intervention: experiment.intervention,
    interventionApplied: true,
    controlInitialStateHash,
    interventionInitialStateHash,
    initialStatesEqual,
    baselineOutcome: baselineResult,
    candidateOutcome: candidateResult,
    trajectoryComparison,
    trajectoryEvidenceStrength,
    evidenceStrength: trajectoryEvidenceStrength,
    controls,
    caveat: 'Trajectory contrast alone does not establish causation. Same initial state is necessary but not sufficient; replication, seed, environment and dependency controls are unverified.',
    executable: false,
    runtimeAuthority: false,
  };
}

function assessEvidenceStrength({ divergenceCount, lengthDiverged, baselineLength, candidateLength, controlsProven }) {
  if (divergenceCount === 0 && !lengthDiverged) return EVIDENCE_LEVELS.NONE;
  if (controlsProven === true) return assessStrongCandidate({ divergenceCount, baselineLength, candidateLength });
  if (divergenceCount === 0 && lengthDiverged) return EVIDENCE_LEVELS.MODERATE;
  if (divergenceCount <= 3) return EVIDENCE_LEVELS.MODERATE;
  return EVIDENCE_LEVELS.WEAK;
}

function assessStrongCandidate({ divergenceCount, baselineLength, candidateLength }) {
  if (divergenceCount === 0) return EVIDENCE_LEVELS.MODERATE;
  if (baselineLength > 0 && candidateLength > 0 && Math.abs(baselineLength - candidateLength) <= 1) return EVIDENCE_LEVELS.STRONG;
  if (divergenceCount <= 3) return EVIDENCE_LEVELS.MODERATE;
  return EVIDENCE_LEVELS.WEAK;
}

function runControlledExperiment({ name, runner, control, intervention, initialState, trajectoryExtractor }) {
  const experiment = createExperiment({ name, runner, control, intervention, initialState });

  // Independent per-branch clones: a mutating runner must not leak
  // control state into the intervention branch (fork contamination).
  const controlState = cloneState(experiment.initialState);
  const interventionState = cloneState(experiment.initialState);
  const controlInitialStateHash = stateHash(controlState);
  const interventionInitialStateHash = stateHash(interventionState);

  const baselineResult = experiment.runner(experiment.control, controlState);
  const candidateResult = experiment.runner(experiment.intervention, interventionState);

  const baselineTrajectory = trajectoryExtractor ? trajectoryExtractor(baselineResult) : (baselineResult?.turns || []);
  const candidateTrajectory = trajectoryExtractor ? trajectoryExtractor(candidateResult) : (candidateResult?.turns || []);

  const trajectoryComparison = compareTrajectories(baselineTrajectory, candidateTrajectory);

  return buildCausalReceipt({
    experiment,
    baselineResult,
    candidateResult,
    baselineTrajectory,
    candidateTrajectory,
    trajectoryComparison,
    controlInitialStateHash,
    interventionInitialStateHash,
  });
}

module.exports = {
  EVIDENCE_LEVELS,
  createExperiment,
  cloneState,
  stateHash,
  executeBaseline,
  executeIntervention,
  compareTrajectories,
  findDivergencePoints,
  buildCausalReceipt,
  assessEvidenceStrength,
  runControlledExperiment,
};
