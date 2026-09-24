'use strict';

const { PATCH_STATUSES } = require('../constants');
const { record, string, enumValue, array, boundedNumber, integer } = require('./contractHelpers');

function validatePatch(input) {
  const patch = record(input, 'METAPOPULATION_PATCH_INVALID');
  const code = 'METAPOPULATION_PATCH_INVALID';
  string(patch.patchId, 'patchId', code);
  record(patch.environment, code);
  array(patch.requirements, 'requirements', code);
  record(patch.resources, code);
  integer(patch.carryingCapacity, 'carryingCapacity', code);
  boundedNumber(patch.quality, 'quality', { minimum: 0, maximum: 1, code });
  boundedNumber(patch.accessibility, 'accessibility', { minimum: 0, maximum: 1, code });
  enumValue(patch.status, 'status', { allowed: PATCH_STATUSES, code });
  return patch;
}

module.exports = { validatePatch };
