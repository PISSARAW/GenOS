'use strict';

const DISSENT_STATUSES = Object.freeze(['OPEN', 'ADDRESSED', 'REFUTED', 'VALIDATED', 'ESCALATED', 'PRESERVED']);

function validateDissent(value) {
  const valid = identityValid(value) && bodyValid(value);
  return valid ? { valid: true, errors: [] } : { valid: false, errors: ['Dissent id, community, status and body are required.'] };
}

function identityValid(value) {
  return value && typeof value === 'object' && typeof value.dissentId === 'string'
    && typeof value.communityId === 'string' && DISSENT_STATUSES.includes(value.status);
}

function bodyValid(value) {
  const dissent = value.dissent;
  return dissent && typeof dissent === 'object' && Array.isArray(dissent.claimRefs)
    && dissent.claimRefs.length > 0 && Array.isArray(dissent.supportingMembers)
    && Array.isArray(dissent.evidenceRefs) && Number.isFinite(dissent.materiality)
    && Number.isFinite(dissent.severity);
}

module.exports = { DISSENT_STATUSES, validateDissent };
