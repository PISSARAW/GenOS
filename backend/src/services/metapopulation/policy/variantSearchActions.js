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
    const stored = observed.demes.find((deme) => deme.demeId === elite.demeId)?.fitnessContext?.islandSearchStates?.[elite.solverId];
    if (stored?.generation === elite.generation) Object.assign(source, stored, { incumbent: stored.incumbentRef });
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
    ...speciationActions(observed, input)
  ];
}

function evolutionRequests(observed, input) {
  if (observed.variantPolicy?.localEvolution !== true) return [];
  const actions = [];
  const requests = [...(input.evolutionRequests || []), ...populationRequests(observed, input)];
  for (const request of requests) {
    const deme = observed.demes.find((d) => d.demeId === request.demeId);
    if (!deme || !Array.isArray(request.population) || actions.some((item) => item.request.demeId === deme.demeId)) continue;
    const seed = request.seed || deterministicSeed({ missionId: input.metapopulationId, demeId: deme.demeId, generation: request.generation, solverId: 'evolution' });
    actions.push({ type: 'EVOLVE_ISLAND', request: { ...request, demeId: deme.demeId, seed } });
  }
  return actions;
}

function populationRequests(observed, input) {
  return observed.demes.filter((deme) => deme.status === 'ACTIVE' && Array.isArray(input.populationRefs?.[deme.demeId]))
    .map((deme) => ({ demeId: deme.demeId, population: input.populationRefs[deme.demeId], generation: deme.generation || 0,
      fitnessContext: deme.fitnessContext || {}, missionId: input.metapopulationId }));
}

function speciationActions(observed, input) {
  if (observed.variantPolicy?.speciation !== true) return [];
  return (input.migrationHistoryByPair || []).filter((pair) => pair.demeA && pair.demeB
    && Array.isArray(pair.migrationHistoryAB) && Array.isArray(pair.migrationHistoryBA))
    .map((pair) => ({ type: 'CHECK_SPECIATION', ...pair }));
}

module.exports = { islandSearchActions, evolutionaryActions, deterministicSeed };
