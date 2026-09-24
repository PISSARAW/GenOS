'use strict';

const { record, string, boundedNumber, integer } = require('./contractHelpers');

function validateMigrationCorridor(input) {
  const corridor = record(input, 'METAPOPULATION_CORRIDOR_INVALID');
  const code = 'METAPOPULATION_CORRIDOR_INVALID';
  for (const field of ['corridorId', 'sourceDemeId', 'targetDemeId']) string(corridor[field], field, code);
  if (corridor.direction !== 'directed') throw Object.assign(new Error('Migration corridors must be directed.'), { code });
  if (typeof corridor.enabled !== 'boolean') throw Object.assign(new Error('enabled must be boolean.'), { code });
  for (const field of ['capacity', 'acceptedMigrations', 'rejectedMigrations']) integer(corridor[field], field, code);
  boundedNumber(corridor.migrationCost, 'migrationCost', { minimum: 0, maximum: Number.MAX_SAFE_INTEGER, code });
  for (const field of ['compatibility', 'homogenizationRisk', 'weight']) {
    boundedNumber(corridor[field], field, { minimum: 0, maximum: 1, code });
  }
  if (!Array.isArray(corridor.benefitHistory)) throw Object.assign(new Error('benefitHistory must be an array.'), { code });
  return corridor;
}

module.exports = { validateMigrationCorridor };
