'use strict';

const populations = require('./populationService');
const agentNicheService = require('../niches/agentNicheService');
const nicheLifecycle = require('../niches/nicheLifecycleService');
const nicheStore = require('../niches/nicheStore');
const evolution = require('./populationEvolutionService');
const mergeService = require('./populationMergeService');

async function execute(ecology, command, options = {}) {
  if (command.type === 'create') return createPopulation(ecology, command.population);
  if (command.type === 'spawn') return spawnPopulation(ecology, command.populationId, command.individuals);
  if (command.type === 'advance') return advancePopulation(ecology, command.populationId, command.measurements);
  if (command.type === 'select') return selectPopulation(ecology, command.populationId, command.count);
  if (command.type === 'migrate') return migrateIndividual(ecology, command);
  if (command.type === 'mutate') return mutatePopulation(ecology, command, options);
  if (command.type === 'freeze') return freezeIndividual(ecology, command, options);
  if (command.type === 'thaw') return thawIndividual(ecology, command);
  if (command.type === 'merge') return mergePopulation(ecology, command);
  throw Object.assign(new Error(`Unknown population operation '${command.type}'.`), { code: 'BIOME_POPULATION_OPERATION_UNKNOWN' });
}

async function mutatePopulation(ecology, command, options) {
  const current = findPopulation(ecology, command.populationId);
  const result = await evolution.mutatePopulation(current, command.variants, options);
  const niche = findNiche(ecology, current.nicheId);
  validateMembers(current, niche, result.variants);
  replacePopulation(ecology, result.population);
  refreshNicheOccupancy(ecology, current.nicheId);
  return { ...result, action: { type: 'POPULATION_VARIANTS_CREATED', status: 'applied', populationId: current.populationId, count: result.variants.length } };
}

function freezeIndividual(ecology, command, options) {
  const current = findPopulation(ecology, command.populationId);
  const result = evolution.freezeIndividual(current, command.individualId, options);
  replacePopulation(ecology, result.population);
  refreshNicheOccupancy(ecology, current.nicheId);
  return { ...result, action: { type: 'INDIVIDUAL_VITRIFIED', status: 'applied', individualId: command.individualId } };
}

function thawIndividual(ecology, command) {
  const current = findPopulation(ecology, command.populationId);
  const niche = findNiche(ecology, current.nicheId);
  if (!isNicheAvailable(niche)) throw populationError('BIOME_NICHE_UNAVAILABLE', current.nicheId);
  const result = evolution.thawIndividual(current, command.individualId, command.environment);
  validateMembers(current, niche, [result.individual]);
  replacePopulation(ecology, result.population);
  refreshNicheOccupancy(ecology, current.nicheId);
  return { ...result, action: { type: 'INDIVIDUAL_GERMINATED', status: 'applied', individualId: command.individualId } };
}

function mergePopulation(ecology, command) {
  const target = findPopulation(ecology, command.targetPopulationId);
  const source = findPopulation(ecology, command.sourcePopulationId);
  const population = mergeService.mergePopulations(target, source);
  replacePopulation(ecology, population);
  ecology.populations = ecology.populations.filter((item) => item.populationId !== source.populationId);
  refreshNicheOccupancy(ecology, target.nicheId);
  return { population, mergedPopulationId: source.populationId, action: { type: 'POPULATIONS_MERGED', status: 'applied', targetPopulationId: target.populationId, sourcePopulationId: source.populationId } };
}

function selectPopulation(ecology, populationId, count) {
  const current = findPopulation(ecology, populationId);
  const result = populations.select(current, count);
  const population = populations.normalizePopulation({ ...current, individuals: result.selected });
  replacePopulation(ecology, population);
  refreshNicheOccupancy(ecology, population.nicheId);
  return { population, removed: result.ranked.length - result.selected.length, action: { type: 'POPULATION_SELECTED', status: 'applied', populationId, count: result.selected.length } };
}

function createPopulation(ecology, input) {
  if (ecology.populations.some((item) => item.populationId === input.populationId)) throw populationError('BIOME_POPULATION_EXISTS', input.populationId);
  const niche = findNiche(ecology, input.nicheId);
  if (!isNicheAvailable(niche)) throw populationError('BIOME_NICHE_UNAVAILABLE', input.nicheId);
  const population = populations.normalizePopulation(input);
  validateMembers(population, niche, population.individuals);
  ecology.populations = [...ecology.populations, population];
  refreshNicheOccupancy(ecology, niche.nicheId);
  return { population, action: { type: 'POPULATION_CREATED', status: 'applied', populationId: population.populationId } };
}

function spawnPopulation(ecology, populationId, individuals) {
  const current = findPopulation(ecology, populationId);
  const result = populations.spawn(current, individuals);
  const niche = findNiche(ecology, current.nicheId);
  validateMembers(current, niche, result.spawned);
  replacePopulation(ecology, result.population);
  refreshNicheOccupancy(ecology, current.nicheId);
  return { population: result.population, spawned: result.spawned, action: { type: 'INDIVIDUALS_SPAWNED', status: 'applied', populationId, count: result.spawned.length } };
}

function advancePopulation(ecology, populationId, measurements = {}) {
  const current = findPopulation(ecology, populationId);
  const population = populations.advance(current, measurements);
  replacePopulation(ecology, population);
  refreshNicheOccupancy(ecology, population.nicheId);
  return { population, action: { type: 'POPULATION_STATUS_CHANGED', status: population.status, populationId } };
}

function migrateIndividual(ecology, command) {
  const source = findPopulation(ecology, command.sourcePopulationId);
  const target = findPopulation(ecology, command.targetPopulationId);
  const niche = findNiche(ecology, target.nicheId);
  if (!isNicheAvailable(niche)) throw Object.assign(new Error(`Niche '${target.nicheId}' is not available for migration.`), { code: 'BIOME_NICHE_UNAVAILABLE' });
  const individual = source.individuals.find((item) => item.individualId === command.individualId);
  if (!individual) throw Object.assign(new Error(`Unknown individual '${command.individualId}'.`), { code: 'BIOME_INDIVIDUAL_UNKNOWN' });
  const assessment = agentNicheService.assessIndividual(individual, ecology.niches);
  if (!assessment.fundamentalNicheIds.includes(target.nicheId)) {
    throw Object.assign(new Error(`Individual '${command.individualId}' is incompatible with niche '${target.nicheId}'.`), { code: 'BIOME_NICHE_INCOMPATIBLE' });
  }
  const preparedSource = { ...source, individuals: source.individuals.map((item) => item.individualId === individual.individualId
    ? { ...item, fundamentalNicheIds: assessment.fundamentalNicheIds, realizedNicheId: target.nicheId, nicheAssessment: assessment.assessment } : item) };
  const result = populations.migrate(preparedSource, target, command.individualId);
  replacePopulation(ecology, result.source);
  replacePopulation(ecology, result.target);
  refreshNicheOccupancy(ecology, source.nicheId);
  refreshNicheOccupancy(ecology, target.nicheId);
  return { ...result, action: { type: 'INDIVIDUAL_MIGRATED', status: 'applied', individualId: command.individualId, sourcePopulationId: source.populationId, targetPopulationId: target.populationId } };
}

function findNiche(ecology, nicheId) {
  const niche = ecology.niches.find((item) => item.nicheId === nicheId);
  if (!niche) throw Object.assign(new Error(`Unknown Biome niche '${nicheId}'.`), { code: 'BIOME_NICHE_UNKNOWN' });
  return niche;
}

function isNicheAvailable(niche) {
  const active = ['open', 'colonized'].includes(niche.status);
  const underCapacity = !niche.carryingCapacity || niche.occupancy < niche.carryingCapacity;
  return active && underCapacity;
}

function validateMembers(population, niche, individuals) {
  for (const individual of individuals) {
    const assessment = agentNicheService.assessIndividual(individual, [niche]);
    if (!assessment.fundamentalNicheIds.includes(population.nicheId)) {
      throw Object.assign(new Error(`Individual '${individual.individualId}' is incompatible with niche '${niche.nicheId}'.`), { code: 'BIOME_NICHE_INCOMPATIBLE' });
    }
  }
}

function refreshNicheOccupancy(ecology, nicheId) {
  const niche = findNiche(ecology, nicheId);
  const occupancy = ecology.populations.filter((item) => item.nicheId === nicheId)
    .reduce((sum, item) => sum + item.individuals.length, 0);
  const updated = nicheLifecycle.advanceNiche(niche, { occupancy });
  if (niche.status === 'saturated' && occupancy < niche.carryingCapacity) {
    updated.status = occupancy ? 'colonized' : 'open';
  }
  if (niche.status === 'colonized' && occupancy === 0) updated.status = 'open';
  ecology.niches = nicheStore.upsertNiche(ecology.niches, updated);
}

function findPopulation(ecology, populationId) {
  const population = ecology.populations.find((item) => item.populationId === populationId);
  if (!population) throw populationError('BIOME_POPULATION_UNKNOWN', populationId);
  return population;
}

function replacePopulation(ecology, population) {
  ecology.populations = ecology.populations.map((item) => item.populationId === population.populationId ? population : item);
}

function populationError(code, id) {
  return Object.assign(new Error(`Unknown or duplicate Biome population or niche '${id}'.`), { code });
}

module.exports = { execute };
