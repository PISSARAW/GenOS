'use strict';

const { RESOURCE_KEYS } = require('../constants');
const workerGarage = require('../../workerGarageService');

function assessNicheCapacity({ niche, populations, measurements = {} }) {
  const resources = aggregateResources(populations.filter((population) => population.nicheId === niche.nicheId));
  const resourceCapacity = estimateResourceCapacity(resources, niche);
  const nicheCapacity = niche.declaredCapacityKnown ? niche.declaredCarryingCapacity : null;
  const base = minimumKnown([resourceCapacity, nicheCapacity]);
  const coordinationCost = nonNegative(measurements.coordinationCost);
  const contention = nonNegative(measurements.contention);
  const marginalProductivity = Number.isFinite(measurements.marginalProductivity)
    ? measurements.marginalProductivity : meanProductivity(populations, niche.nicheId);
  const efficiency = Math.max(0, 1 + marginalProductivity) / (1 + coordinationCost + contention);
  const localCapacity = base === null ? null : Math.floor(base * efficiency);
  return { nicheId: niche.nicheId, localCapacity, resourceCapacity, nicheCapacity,
    coordinationCost, marginalProductivity, contention, efficiency,
    limitingResources: resourceCapacity === null ? [] : limitingResourceKeys(resources, niche, resourceCapacity) };
}

function applyGarageLimit(capacities, niches, garageCapacity) {
  if (!Number.isSafeInteger(garageCapacity) || garageCapacity < 0) {
    throw Object.assign(new Error('Garage capacity must be a non-negative safe integer.'), { code: 'BIOME_GARAGE_CAPACITY_INVALID' });
  }
  const scores = new Map(niches.map((niche) => [niche.nicheId, niche.opportunityScore]));
  let remaining = garageCapacity;
  return capacities.map((entry) => ({ ...entry, score: scores.get(entry.nicheId) || 0 }))
    .sort((left, right) => right.score - left.score || left.nicheId.localeCompare(right.nicheId))
    .map((entry) => {
      const capacity = entry.localCapacity === null ? remaining : Math.min(entry.localCapacity, remaining);
      remaining = Math.max(0, remaining - capacity);
      return { ...entry, capacity, garageCapacity };
    });
}

function resolveGarageCapacity(value) {
  return value === undefined ? workerGarage.maxActiveWorkers() : value;
}

function estimateCapacity(population, niche) {
  const limits = RESOURCE_KEYS.filter((key) => perIndividualRequirement(niche, key) > 0)
    .map((key) => Math.floor(population.resourcePool[key] / perIndividualRequirement(niche, key)));
  const resourceCapacity = limits.length ? Math.min(...limits) : null;
  const nicheCapacity = niche.carryingCapacity || null;
  const capacity = resourceCapacity === null ? nicheCapacity
    : nicheCapacity === null ? resourceCapacity : Math.min(resourceCapacity, nicheCapacity);
  return { populationId: population.populationId, nicheId: niche.nicheId, capacity, resourceCapacity, nicheCapacity,
    limitingResources: limits.length ? limitingKeys(population, niche, resourceCapacity) : [] };
}

function aggregateResources(populations) {
  return Object.fromEntries(RESOURCE_KEYS.map((key) => [key,
    populations.reduce((sum, population) => sum + population.resourcePool[key], 0)]));
}

function estimateResourceCapacity(resources, niche) {
  const limits = RESOURCE_KEYS.filter((key) => perIndividualRequirement(niche, key) > 0)
    .map((key) => Math.floor(resources[key] / perIndividualRequirement(niche, key)));
  return limits.length ? Math.min(...limits) : null;
}

function minimumKnown(values) {
  const known = values.filter((value) => value !== null);
  return known.length ? Math.min(...known) : null;
}

function nonNegative(value) {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function meanProductivity(populations, nicheId) {
  const members = populations.filter((population) => population.nicheId === nicheId);
  if (!members.length) return 0;
  return members.reduce((sum, population) => sum + population.marginalProductivity, 0) / members.length;
}

function limitingResourceKeys(resources, niche, capacity) {
  return RESOURCE_KEYS.filter((key) => perIndividualRequirement(niche, key) > 0
    && Math.floor(resources[key] / perIndividualRequirement(niche, key)) === capacity);
}

function limitingKeys(population, niche, capacity) {
  return RESOURCE_KEYS.filter((key) => perIndividualRequirement(niche, key) > 0
    && Math.floor(population.resourcePool[key] / perIndividualRequirement(niche, key)) === capacity);
}

function perIndividualRequirement(niche, key) {
  return niche.resourceProfile[key].minimum || niche.resourceProfile[key].preferred;
}

module.exports = { estimateCapacity, assessNicheCapacity, applyGarageLimit, resolveGarageCapacity };
