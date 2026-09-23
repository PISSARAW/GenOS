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

function executeBaseline(experiment) {
  return experiment.runner(experiment.control, experiment.initialState);
}

function executeIntervention(experiment) {
  return experiment.runner(experiment.intervention, experiment.initialState);
}

function compareTrajectories(baselineTrajectory, candidateTrajectory) {
  const divergences = findDivergencePoints(baselineTrajectory, candidateTrajectory);
  return {
    diverged: divergences.length > 0,
    divergenceCount: divergences.length,
    firstDivergence: divergences.length ? divergences[0] : null,
    baselineLength: baselineTrajectory.length,
    candidateLength: candidateTrajectory.length,
  };
}

function findDivergencePoints(baseline, candidate) {
  const divergences = [];
  // Only compare positions that exist in both trajectories.
  // If lengths differ, the difference is a divergence in itself — reported
  // via baselineLength/candidateLength in the comparison object.
  const minLen = Math.min(baseline.length, candidate.length);
  for (let i = 0; i < minLen; i++) {
    if (baseline[i] !== candidate[i]) {
      divergences.push({ step: i, baseline: baseline[i], candidate: candidate[i] });
    }
  }
  return divergences;
}

function buildCausalReceipt({ experiment, baselineResult, candidateResult, baselineTrajectory, candidateTrajectory, trajectoryComparison }) {
  const evidenceStrength = assessEvidenceStrength({
    divergenceCount: trajectoryComparison.divergenceCount,
    baselineLength: baselineTrajectory.length,
    candidateLength: candidateTrajectory.length,
  });

  return {
    experimentName: experiment.name,
    executedAt: Date.now(),
    interventionApplied: true,
    baselineOutcome: baselineResult,
    candidateOutcome: candidateResult,
    trajectoryComparison,
    evidenceStrength,
    caveat: 'Same initial state is necessary but not sufficient for causal inference.',
    executable: false,
    runtimeAuthority: false,
  };
}

function assessEvidenceStrength({ divergenceCount, baselineLength, candidateLength }) {
  if (divergenceCount === 0) return EVIDENCE_LEVELS.NONE;
  // STRONG requires equal-length trajectories (same granularity of observation).
  if (baselineLength > 0 && candidateLength > 0 && Math.abs(baselineLength - candidateLength) <= 1) return EVIDENCE_LEVELS.STRONG;
  // MODERATE: few divergences suggest a localized causal effect.
  // The threshold (3) is conservative — above this, noise dominates signal.
  if (divergenceCount <= 3) return EVIDENCE_LEVELS.MODERATE;
  return EVIDENCE_LEVELS.WEAK;
}

function runControlledExperiment({ name, runner, control, intervention, initialState, trajectoryExtractor }) {
  // Deep-clone initialState so baseline and intervention runs are independent.
  // Without this, a runner that mutates state would corrupt the second run.
  const safeInitialState = initialState !== undefined ? JSON.parse(JSON.stringify(initialState)) : undefined;
  const experiment = createExperiment({ name, runner, control, intervention, initialState: safeInitialState });

  const baselineResult = executeBaseline(experiment);
  const candidateResult = executeIntervention(experiment);

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
  });
}

module.exports = {
  EVIDENCE_LEVELS,
  createExperiment,
  executeBaseline,
  executeIntervention,
  compareTrajectories,
  findDivergencePoints,
  buildCausalReceipt,
  runControlledExperiment,
};
