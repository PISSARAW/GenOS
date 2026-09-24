'use strict';

const { DEME_STATUSES } = require('../constants');
const { record, string, enumValue, array, boundedNumber } = require('./contractHelpers');

function validateDeme(input) {
  const deme = record(input, 'METAPOPULATION_DEME_INVALID');
  const code = 'METAPOPULATION_DEME_INVALID';
  string(deme.demeId, 'demeId', code);
  string(deme.patchId, 'patchId', code);
  array(deme.members, 'members', code);
  array(deme.localStrategies, 'localStrategies', code);
  array(deme.localProcedures, 'localProcedures', code);
  record(deme.lineage, code);
  record(deme.fitness, code);
  enumValue(deme.status, 'status', { allowed: DEME_STATUSES, code });
  boundedNumber(deme.diversity, 'diversity', { minimum: 0, maximum: 1, code });
  return deme;
}

module.exports = { validateDeme };
