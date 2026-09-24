'use strict';

const { createResourceVector } = require('../contracts/resourceVector');
const { normalizePopulation } = require('./populationService');

function mergePopulations(target, source) {
  if (target.nicheId !== source.nicheId) {
    throw Object.assign(new Error('Populations can merge only within the same niche.'), { code: 'BIOME_POPULATION_NICHE_MISMATCH' });
  }
  const identifiers = new Set(target.individuals.map((item) => item.individualId));
  if (source.individuals.some((item) => identifiers.has(item.individualId))) {
    throw Object.assign(new Error('Populations contain duplicate individual identifiers.'), { code: 'BIOME_INDIVIDUAL_DUPLICATE' });
  }
  const resourcePool = mergeResources(target.resourcePool, source.resourcePool);
  return normalizePopulation({
    ...target,
    individuals: [...target.individuals, ...source.individuals],
    spores: [...(target.spores || []), ...(source.spores || [])],
    resourcePool,
    lineage: [...target.lineage, ...source.lineage, { mergedPopulationId: source.populationId }]
  });
}

function mergeResources(left = {}, right = {}) {
  return createResourceVector(Object.fromEntries(Object.keys(left).map((key) => [key, left[key] + (right[key] || 0)])));
}

module.exports = { mergePopulations };
