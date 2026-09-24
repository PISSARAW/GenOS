'use strict';

const { createPopulation } = require('../contracts/population');
const diversity = require('./populationDiversityService');
const lifecycle = require('./populationLifecycle');
const spawner = require('./populationSpawner');
const selection = require('./populationSelectionService');
const migration = require('./populationMigrationService');

function normalizePopulation(input) {
  const population = createPopulation(input);
  return createPopulation({ ...population, diversity: diversity.measureDiversity(population.individuals) });
}

function spawn(population, candidates) {
  const result = spawner.spawnIndividuals(normalizePopulation(population), candidates);
  return { ...result, population: normalizePopulation(result.population) };
}

function advance(population, measurements) {
  const current = normalizePopulation(population);
  return normalizePopulation(lifecycle.advancePopulation(current, measurements));
}

function select(population, count) {
  return selection.selectIndividuals(population.individuals, count);
}

function migrate(source, target, individualId) {
  const result = migration.migrateIndividual(source, target, individualId);
  return { ...result, source: normalizePopulation(result.source), target: normalizePopulation(result.target) };
}

module.exports = { normalizePopulation, spawn, advance, select, migrate };
