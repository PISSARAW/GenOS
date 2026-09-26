'use strict';

const adaptiveMigrationTriggerService = require('../migration/adaptiveMigrationTriggerService');
const islandSearchRuntime = require('../evolution/islandSearchRuntimeService');
const { routableMigrationAction } = require('./variantFlowActions');

async function islandSearchActions(observed, input, options) {
  return [
    ...searchRequests(observed, input),
    ...periodicMigrationTrigger(observed, input),
    ...eliteMigrationActions(observed, input)
  ];
}

function searchRequests(observed, input) {
  const actions = [];
  for (const request of input.islandSearchRequests || []) {
    const deme = observed.demes.find((d) => d.demeId === request.demeId);
    if (!deme) continue;
    const seed = request.seed || deterministicSeed({ missionId: input.metapopulationId, demeId: deme.demeId, generation: request.generation, solverId: request.solverId });
    actions.push({ type: 'SEARCH_ISLAND', request: { ...request, seed, stateIsolation: 'ISLAND_LOCAL', demeId: deme.demeId } });
  }
  return actions;
}

function periodicMigrationTrigger(observed, input) {
  if (observed.variantPolicy?.migrationFrequency !== 'periodic') return [];
  const interval = adaptiveMigrationTriggerService.calculateAdaptiveInterval({
    variant: 'island_search',
    baseInterval: 5,
    stagnationGenerations: input.stagnationGenerations,
    incumbentImproved: input.incumbentImproved,
    counterexampleFound: input.counterexampleFound,
    diversityScore: input.diversityScore,
    synchronizationRisk: input.synchronizationRisk
  });
  return input.generation % interval === 0
    ? [{ type: 'TRIGGER_ISLAND_MIGRATION', interval, reason: 'PERIODIC_INTERVAL' }]
    : [];
}

function eliteMigrationActions(observed, input) {
  if (observed.variantPolicy?.eliteMigration !== true) return [];
  const actions = [];
  for (const elite of input.islandElites || []) {
    const source = islandSearchRuntime.getSolverState(elite.solverId, elite.demeId, elite.generation);
    const migrant = islandSearchRuntime.buildIslandEliteMigrant(source, elite);
    if (!migrant) continue;
    const action = routableMigrationAction({ candidate: migrant, observed, input, reason: migrant.migrationReason });
    if (action) actions.push(action);
  }
  return actions;
}

function deterministicSeed(context) {
  const { deterministicSeed: bridgeSeed } = require('../evolution/islandSearchBridge');
  return bridgeSeed(context);
}

async function evolutionaryActions(observed, input, options) {
  return [
    ...evolutionRequests(observed, input),
    ...reproductionActions(observed, input),
    ...speciationActions(observed)
  ];
}

function evolutionRequests(observed, input) {
  if (observed.variantPolicy?.localEvolution !== true) return [];
  const actions = [];
  for (const request of input.evolutionRequests || []) {
    const deme = observed.demes.find((d) => d.demeId === request.demeId);
    if (!deme) continue;
      const seed = request.seed || deterministicSeed({ missionId: input.metapopulationId, demeId: deme.demeId, generation: request.generation, solverId: 'evolution' });
    actions.push({ type: 'EVOLVE_ISLAND', request: { ...request, demeId: deme.demeId, seed } });
  }
  return actions;
}

function reproductionActions(observed, input) {
  if (observed.variantPolicy?.reproduceLocally !== true) return [];
  return observed.demes.filter((d) => d.status === 'ACTIVE' && input.populationRefs?.[d.demeId])
    .map((deme) => ({ type: 'LOCAL_REPRODUCTION', demeId: deme.demeId, population: input.populationRefs[deme.demeId] }));
}

function speciationActions(observed) {
  return observed.variantPolicy?.speciation === true
    ? [{ type: 'CHECK_SPECIATION', demes: observed.demes }]
    : [];
}

module.exports = { islandSearchActions, evolutionaryActions, deterministicSeed };
