'use strict';
const { deterministicSeed } = require('./islandSearchBridge');
const { selectCandidates } = require('../migration/migrationPolicyService');

const solverStateStore = new Map();

function getSolverState(solverId, demeId, generation) {
  const key = `${solverId}:${demeId}:${generation}`;
  if (!solverStateStore.has(key)) {
    solverStateStore.set(key, {
      solverId,
      demeId,
      generation,
      incumbent: null,
      lowerBound: null,
      upperBound: null,
      iterations: 0,
      lastSearchAt: null,
      seed: deterministicSeed({ solverId, demeId, generation }),
    });
  }
  return solverStateStore.get(key);
}

function updateSolverState(state, result) {
  state.incumbent = result.incumbentRef || state.incumbent;
  state.lowerBound = result.lowerBound !== undefined ? result.lowerBound : state.lowerBound;
  state.upperBound = result.upperBound !== undefined ? result.upperBound : state.upperBound;
  state.iterations += result.iterations || 0;
  state.lastSearchAt = new Date().toISOString();
}

function migrateBounds(sourceState, targetDemeId) {
  if (!sourceState || !sourceState.incumbent) return null;
  return {
    type: 'BOUNDS',
    sourceDemeId: sourceState.demeId,
    targetDemeId,
    incumbentRef: sourceState.incumbent,
    lowerBound: sourceState.lowerBound,
    upperBound: sourceState.upperBound,
    generation: sourceState.generation,
  };
}

function isStagnating(state, thresholdIterations = 100) {
  return state.iterations > 0 && state.iterations >= thresholdIterations;
}

function islandDiversityBenchmark(demes, solverStates) {
  const perSolver = new Map();
  for (const state of solverStates) {
    const solver = state.solverId;
    if (!perSolver.has(solver)) perSolver.set(solver, []);
    perSolver.get(solver).push(state);
  }
  const diversity = {
    solverCount: perSolver.size,
    demeCount: demes.length,
    solverPerDeme: {},
    averageIterations: solverStates.length
      ? Math.round(solverStates.reduce((s, st) => s + st.iterations, 0) / solverStates.length)
      : 0,
    stagnatingIslands: solverStates.filter((s) => isStagnating(s)).length,
  };
  for (const [solver, states] of perSolver) {
    diversity.solverPerDeme[solver] = states.map((s) => s.demeId);
  }
  return diversity;
}

function buildIslandEliteMigrant(state, target) {
  if (!state || !state.incumbent) return null;
  const targetDemeId = target.targetDemeId || target.demeId;
  if (!targetDemeId || targetDemeId === state.demeId) return null;
  return islandElitePropagule(state, target, targetDemeId);
}

function islandElitePropagule(state, target, targetDemeId) {
  return {
    propaguleId: `island-elite-${state.demeId}-${targetDemeId}-${state.generation}`,
    type: 'ELITE',
    sourceDemeId: state.demeId,
    targetDemeId,
    payloadRef: state.incumbent,
    migrationReason: eliteReason(target),
    lineageRefs: [],
    sourceEvidence: target.evidenceRefs || [],
    provenance: { source: 'island-search', solverId: state.solverId, generation: state.generation },
    sourceFitness: target.fitness ?? 0.5,
    novelty: target.novelty ?? 0.5,
    incumbentRef: state.incumbent,
    lowerBound: state.lowerBound,
    upperBound: state.upperBound,
    counterexampleRefs: target.counterexampleRefs || [],
  };
}

function eliteReason(target) {
  if (target.counterexample === true) return 'counterexample';
  return 'elite';
}

module.exports = {
  getSolverState,
  updateSolverState,
  migrateBounds,
  isStagnating,
  islandDiversityBenchmark,
  buildIslandEliteMigrant,
};
