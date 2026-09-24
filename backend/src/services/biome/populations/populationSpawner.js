'use strict';

const { createIndividual } = require('../contracts/individual');

function spawnIndividuals(population, candidates) {
  const existing = new Map(population.individuals.map((individual) => [individual.individualId, individual]));
  const spawned = [];
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const individual = createIndividual(candidate);
    if (existing.has(individual.individualId)) continue;
    existing.set(individual.individualId, individual);
    spawned.push(individual);
  }
  return {
    population: { ...population, individuals: [...existing.values()] },
    spawned
  };
}

module.exports = { spawnIndividuals };
