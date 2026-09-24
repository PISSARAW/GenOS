'use strict';
const { validateMigrationCorridor } = require('./migrationCorridorContract');

function validateCorridor(input) {
  if (input.sourceDemeId === input.targetDemeId) {
    throw Object.assign(new Error('A corridor must connect two distinct demes.'), { code: 'METAPOPULATION_CORRIDOR_INVALID' });
  }
  return validateMigrationCorridor(input);
}

function normalizeCorridor(input) {
  return validateCorridor({
    corridorId: input.corridorId || `${input.sourceDemeId}->${input.targetDemeId}`,
    direction: 'directed', enabled: true, capacity: 0, migrationCost: 0,
    compatibility: 0, acceptedMigrations: 0, rejectedMigrations: 0,
    benefitHistory: [], homogenizationRisk: 0, weight: 0.5, ...input
  });
}

module.exports = { validateCorridor, normalizeCorridor };
