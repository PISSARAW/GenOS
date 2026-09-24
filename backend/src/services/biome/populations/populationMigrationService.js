'use strict';

function migrateIndividual(source, target, individualId) {
  const individual = source.individuals.find((item) => item.individualId === individualId);
  if (!individual) throw Object.assign(new Error(`Unknown individual '${individualId}'.`), { code: 'BIOME_INDIVIDUAL_UNKNOWN' });
  if (target.individuals.some((item) => item.individualId === individualId)) {
    throw Object.assign(new Error(`Individual '${individualId}' already belongs to the target population.`), { code: 'BIOME_INDIVIDUAL_ALREADY_PRESENT' });
  }
  return {
    source: { ...source, individuals: source.individuals.filter((item) => item.individualId !== individualId) },
    target: { ...target, individuals: [...target.individuals, individual] },
    individual
  };
}

module.exports = { migrateIndividual };
