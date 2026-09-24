'use strict';

const valueService = require('./propagationValueService');
const propagation = require('../../proceduralRhizomePropagationService');

function hasLocalEvidence(input) {
  return input.localValidation?.status === 'VERIFIED'
    && Array.isArray(input.localValidation.evidenceRefs) && input.localValidation.evidenceRefs.length > 0;
}

function propagate(input) {
  if (!hasLocalEvidence(input)) return { assimilated: false, reason: 'LOCAL_VALIDATION_REQUIRED', value: 0 };
  const value = valueService.value(input);
  if (value <= 0) return { assimilated: false, reason: 'NON_POSITIVE_PROPAGATION_VALUE', value };
  const fragment = propagation.validateFragment(input.fragment, (item) => item.procedure != null);
  const assimilated = propagation.assimilate(input.target, { ...fragment, validated: fragment.validated && hasLocalEvidence(input) });
  return { assimilated: true, reason: 'LOCALLY_VALIDATED', value, result: assimilated };
}

module.exports = { propagate };
