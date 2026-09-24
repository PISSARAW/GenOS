'use strict';

const { PROPAGULE_TYPES } = require('../constants');
const { record, string, enumValue, array, boundedNumber } = require('./contractHelpers');

function validatePropagule(input) {
  const propagule = record(input, 'METAPOPULATION_PROPAGULE_INVALID');
  const code = 'METAPOPULATION_PROPAGULE_INVALID';
  for (const field of ['propaguleId', 'sourceDemeId', 'targetDemeId', 'payloadRef', 'migrationReason']) string(propagule[field], field, code);
  enumValue(propagule.type, 'type', { allowed: PROPAGULE_TYPES, code });
  array(propagule.lineageRefs, 'lineageRefs', code);
  array(propagule.sourceEvidence, 'sourceEvidence', code);
  record(propagule.provenance, code);
  boundedNumber(propagule.sourceFitness, 'sourceFitness', { minimum: 0, maximum: 1, code });
  boundedNumber(propagule.novelty, 'novelty', { minimum: 0, maximum: 1, code });
  return propagule;
}

module.exports = { validatePropagule };
