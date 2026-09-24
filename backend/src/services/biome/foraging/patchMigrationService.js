'use strict';

const resourceSteward = require('../resources/resourceStewardService');

function migrate({ ecology, populationId, individualId, targetPatch, migrationCost }) {
  const population = ecology.populations.find((item) => item.populationId === populationId);
  if (!population) throw Object.assign(new Error(`Unknown migration population '${populationId}'.`), { code: 'BIOME_POPULATION_UNKNOWN' });
  const niche = ecology.niches.find((item) => item.nicheId === population.nicheId);
  const debit = resourceSteward.consume(population, niche, migrationCost || {});
  const individuals = individualId ? moveIndividual(debit.population.individuals, individualId, targetPatch)
    : debit.population.individuals.map((item) => ({ ...item, patchId: targetPatch }));
  const updated = { ...debit.population, individuals, patchId: individualId ? debit.population.patchId : targetPatch };
  ecology.populations = ecology.populations.map((item) => item.populationId === populationId ? updated : item);
  recordMigration(ecology, { populationId, individualId, targetPatch, cost: debit.consumed });
  return { population: updated, consumed: debit.consumed, pressure: debit.pressure };
}

function moveIndividual(individuals, individualId, targetPatch) {
  if (!individuals.some((item) => item.individualId === individualId)) {
    throw Object.assign(new Error(`Unknown individual '${individualId}'.`), { code: 'BIOME_INDIVIDUAL_UNKNOWN' });
  }
  return individuals.map((item) => item.individualId === individualId ? { ...item, patchId: targetPatch } : item);
}

function recordMigration(ecology, migration) {
  const movements = ecology.ecologicalState.patchMigrations || [];
  ecology.ecologicalState.patchMigrations = [...movements, { ...migration, timestamp: new Date().toISOString() }];
  ecology.ecologicalState.patchOccupancy = measureOccupancy(ecology.populations);
}

function measureOccupancy(populations) {
  const occupancy = {};
  for (const population of populations) {
    if (!population.individuals.length && population.patchId) addOccupant(occupancy, population.patchId, 1);
    for (const individual of population.individuals) {
      const patchId = individual.patchId || population.patchId;
      if (patchId) addOccupant(occupancy, patchId, 1);
    }
  }
  return occupancy;
}

function addOccupant(occupancy, patchId, count) {
  occupancy[patchId] = (occupancy[patchId] || 0) + count;
}

module.exports = { migrate, measureOccupancy };
