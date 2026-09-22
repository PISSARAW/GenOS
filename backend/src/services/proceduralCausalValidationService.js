'use strict';

// Causal validation bridge — connects the procedural organism pipeline to the
// GenOS causal fork machinery (genos_causality_fork / mutatedUniverses /
// causalDiff). This is the distinctive part of the paper's cycle:
//
//   procedural candidate
//         |
//   baseline fork ──┬── candidate fork     (same initial state)
//                   |
//             causalDiff
//                   |
//         causal evidence -> promotion gate
//
// The runner is injectable: tests pass a deterministic simulator, the runtime
// passes the real executor. The comparison is only causal if both forks start
// from the SAME initial state.

const temporalHelpers = require('./primitiveHandlers/temporalHelpers');

function runOrganism(runner, organism, initialState) {
  if (typeof runner !== 'function') {
    throw new Error('causal validation requires a runner function');
  }
  return runner(organism, initialState);
}

function trajectoryFrom(result) {
  const turns = Array.isArray(result && result.turns) ? result.turns : [];
  const outcome = result && result.outcome != null ? result.outcome : null;
  return { turns, outcome };
}

function scoreFromOutcome(outcome) {
  if (outcome == null) return 0;
  if (typeof outcome === 'number') return Number.isFinite(outcome) ? outcome : 0;
  if (outcome === 'success') return 1;
  if (outcome === 'failure') return 0;
  return 0;
}

function compareForks(baselineRun, candidateRun) {
  const baseline = trajectoryFrom(baselineRun);
  const candidate = trajectoryFrom(candidateRun);
  const { divergences } = { divergences: temporalHelpers.findDivergences(baseline.turns, candidate.turns) };
  const baselineScore = scoreFromOutcome(baseline.outcome);
  const candidateScore = scoreFromOutcome(candidate.outcome);
  return {
    divergences,
    divergenceCount: divergences.length,
    firstDivergenceStep: divergences.length ? divergences[0].stepIndex : null,
    baselineScore,
    candidateScore,
    scoreDelta: candidateScore - baselineScore,
    sameInitialState: true,
  };
}

function causalVerdict(comparison) {
  // The mutation causally improved the procedure only if the trajectories
  // actually diverged AND the candidate scored strictly higher.
  const improved = comparison.divergenceCount > 0 && comparison.scoreDelta > 0;
  const regressed = comparison.divergenceCount > 0 && comparison.scoreDelta < 0;
  return {
    verdict: improved ? 'CAUSAL_IMPROVEMENT' : (regressed ? 'CAUSAL_REGRESSION' : 'NO_CAUSAL_EFFECT'),
    causalEvidence: comparison.divergenceCount > 0,
    improvement: improved,
    regression: regressed,
    scoreDelta: comparison.scoreDelta,
  };
}

function validateCausally({ runner, parent, candidate, initialState }) {
  if (!initialState) {
    throw new Error('causal validation requires an explicit initialState shared by both forks');
  }
  const baselineRun = runOrganism(runner, parent, initialState);
  const candidateRun = runOrganism(runner, candidate, initialState);
  const comparison = compareForks(baselineRun, candidateRun);
  return {
    ...causalVerdict(comparison),
    comparison: {
      divergenceCount: comparison.divergenceCount,
      firstDivergenceStep: comparison.firstDivergenceStep,
      baselineScore: comparison.baselineScore,
      candidateScore: comparison.candidateScore,
      sameInitialState: comparison.sameInitialState,
    },
  };
}

module.exports = {
  validateCausally,
  compareForks,
  causalVerdict,
  runOrganism,
};
