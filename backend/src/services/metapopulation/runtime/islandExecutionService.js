'use strict';

const store = require('../metapopulationStore');
const evolution = require('../evolution/metapopulationEvolutionBridge');
const search = require('../evolution/islandSearchBridge');
const solverRuntime = require('../evolution/islandSearchRuntimeService');

async function resident(action, context) {
  const deme = await store.getDeme(context.options.db, context.input.metapopulationId, action.request.demeId);
  if (!deme || !['ACTIVE', 'STRESSED', 'AT_RISK', 'ESTABLISHING'].includes(deme.status)) {
    throw Object.assign(new Error('A live local island is required.'), { code: 'METAPOPULATION_ISLAND_NOT_RESIDENT' });
  }
  return deme;
}

async function evolveIsland(action, context) {
  const deme = await resident(action, context);
  const request = { ...action.request, generation: deme.generation ?? action.request.generation,
    population: deme.population ?? action.request.population, fitnessContext: deme.fitnessContext ?? action.request.fitnessContext };
  const result = await evolution.evolveIsland(request, context.options);
  if (result.generation < (request.generation || 0)) {
    throw Object.assign(new Error('Island generation cannot regress.'), { code: 'METAPOPULATION_GENERATION_REGRESSION' });
  }
  const changes = { generation: result.generation,
    fitness: { ...deme.fitness, score: result.bestFitness, mean: result.meanFitness } };
  if (result.population) changes.population = result.population;
  await store.updateDemeProfile(context.options.db, { metapopulationId: context.input.metapopulationId,
    demeId: deme.demeId, changes });
  return { type: action.type, ...result, persisted: true };
}

async function searchIsland(action, context) {
  const deme = await resident(action, context);
  const states = deme.fitnessContext?.islandSearchStates || {};
  const previous = states[action.request.solverId];
  const request = { ...action.request, generation: deme.generation ?? action.request.generation,
    state: previous?.problemRef === action.request.problemRef ? previous : null };
  const result = await search.searchIsland(request, context.options);
  const state = { ...result, problemRef: request.problemRef, generation: request.generation || 0,
    iterations: (request.state?.iterations || 0) + result.iterations };
  await store.updateDemeProfile(context.options.db, { metapopulationId: context.input.metapopulationId,
    demeId: deme.demeId, changes: { fitnessContext: { ...deme.fitnessContext,
      islandSearchStates: { ...states, [request.solverId]: state } } } });
  const cache = solverRuntime.getSolverState(request.solverId, deme.demeId, state.generation);
  Object.assign(cache, state, { incumbent: result.incumbentRef });
  return { type: action.type, ...result, totalIterations: state.iterations, persisted: true };
}

function verifyIslandResult(action, result, session) {
  const deme = session.demes.find((item) => item.demeId === action.request.demeId);
  if (!deme || !result?.persisted || result.demeId !== deme.demeId) return false;
  if (action.type === 'EVOLVE_ISLAND') return result.engine === 'rust-multi-island'
    && deme.generation === result.generation && deme.fitness.score === result.bestFitness;
  const state = deme.fitnessContext?.islandSearchStates?.[action.request.solverId];
  return result.engine === 'island-search-adapter' && state?.problemRef === action.request.problemRef
    && state.incumbentRef === result.incumbentRef && state.iterations === result.totalIterations;
}

module.exports = { evolveIsland, searchIsland, verifyIslandResult };
