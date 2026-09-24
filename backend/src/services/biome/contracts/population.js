'use strict';

const { POPULATION_STATUSES } = require('../constants');
const { requiredId, enumValue, nonNegative } = require('./contractHelpers');
const { createResourceVector } = require('./resourceVector');
const { createIndividual } = require('./individual');

function createPopulation(input = {}) {
  return {
    populationId: requiredId(input.populationId, 'populationId'),
    nicheId: requiredId(input.nicheId, 'nicheId'),
    patchId: input.patchId || null,
    individuals: Array.isArray(input.individuals) ? input.individuals.map(createIndividual) : [],
    spores: Array.isArray(input.spores) ? input.spores : [],
    strategies: Array.isArray(input.strategies) ? input.strategies : [],
    cognitiveRecipes: Array.isArray(input.cognitiveRecipes) ? input.cognitiveRecipes : [],
    localMemory: input.localMemory || [],
    resourcePool: createResourceVector(input.resourcePool),
    allocationSignals: signalObject(input.allocationSignals),
    diversity: nonNegative(input.diversity, 'diversity'),
    productivity: nonNegative(input.productivity, 'productivity'),
    marginalProductivity: Number.isFinite(input.marginalProductivity) ? input.marginalProductivity : 0,
    birthRate: nonNegative(input.birthRate, 'birthRate'),
    deathRate: nonNegative(input.deathRate, 'deathRate'),
    migrationRate: nonNegative(input.migrationRate, 'migrationRate'),
    health: input.health || 'unknown',
    lineage: input.lineage || [],
    status: enumValue({ value: input.status, choices: POPULATION_STATUSES, field: 'status', fallback: 'seed' })
  };
}

function signalObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

module.exports = { createPopulation };
