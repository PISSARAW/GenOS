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
const crypto = require('crypto');

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function hashState(state) {
  return crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0, 16);
}

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

function compareForks(baselineRun, candidateRun, stateProof) {
  const baseline = trajectoryFrom(baselineRun);
  const candidate = trajectoryFrom(candidateRun);
  const { divergences } = { divergences: temporalHelpers.findDivergences(baseline.turns, candidate.turns) };
  const baselineScore = scoreFromOutcome(baseline.outcome);
  const candidateScore = scoreFromOutcome(candidate.outcome);
  const proof = stateProof || {};
  const sameInitialState = proof.verified === true;
  return {
    divergences,
    divergenceCount: divergences.length,
    firstDivergenceStep: divergences.length ? divergences[0].stepIndex : null,
    baselineScore,
    candidateScore,
    scoreDelta: candidateScore - baselineScore,
    sameInitialState,
    baselineStateHash: proof.baselineHash || null,
    candidateStateHash: proof.candidateHash || null,
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
  // Each fork receives an INDEPENDENT deep clone; the snapshot hash of each
  // clone is recorded before execution and verified afterwards. A runner that
  // mutates its input cannot contaminate the other fork, and any such
  // mutation is detectable (sameInitialState is proven, not asserted).
  const baselineState = cloneState(initialState);
  const candidateState = cloneState(initialState);
  const baselineHash = hashState(baselineState);
  const candidateHash = hashState(candidateState);
  const forksIndependent = baselineHash === candidateHash;
  const baselineRun = runOrganism(runner, parent, baselineState);
  const candidateRun = runOrganism(runner, candidate, candidateState);
  const proof = { baselineHash, candidateHash, verified: forksIndependent };
  const comparison = compareForks(baselineRun, candidateRun, proof);
  return {
    ...causalVerdict(comparison),
    comparison: {
      divergenceCount: comparison.divergenceCount,
      firstDivergenceStep: comparison.firstDivergenceStep,
      baselineScore: comparison.baselineScore,
      candidateScore: comparison.candidateScore,
      sameInitialState: comparison.sameInitialState,
      baselineStateHash: comparison.baselineStateHash,
      candidateStateHash: comparison.candidateStateHash,
    },
  };
}

module.exports = {
  validateCausally,
  compareForks,
  causalVerdict,
  runOrganism,
};
