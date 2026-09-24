'use strict';

const { RESOURCE_KEYS } = require('../constants');

function estimateCapacity(population, niche) {
  const limits = RESOURCE_KEYS.filter((key) => niche.resourceProfile[key].preferred > 0)
    .map((key) => Math.floor(population.resourcePool[key] / niche.resourceProfile[key].preferred));
  const resourceCapacity = limits.length ? Math.min(...limits) : null;
  const nicheCapacity = niche.carryingCapacity || null;
  const capacity = resourceCapacity === null ? nicheCapacity
    : nicheCapacity === null ? resourceCapacity : Math.min(resourceCapacity, nicheCapacity);
  return { populationId: population.populationId, nicheId: niche.nicheId, capacity, resourceCapacity, nicheCapacity,
    limitingResources: limits.length ? limitingKeys(population, niche, resourceCapacity) : [] };
}

function limitingKeys(population, niche, capacity) {
  return RESOURCE_KEYS.filter((key) => niche.resourceProfile[key].preferred > 0
    && Math.floor(population.resourcePool[key] / niche.resourceProfile[key].preferred) === capacity);
}

module.exports = { estimateCapacity };
