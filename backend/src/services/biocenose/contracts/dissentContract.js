'use strict';

const DISSENT_STATUSES = Object.freeze(['OPEN', 'ADDRESSED', 'REFUTED', 'VALIDATED', 'ESCALATED', 'PRESERVED']);

function validateDissent(value) {
  const valid = value && typeof value === 'object' && typeof value.dissentId === 'string'
    && typeof value.communityId === 'string' && DISSENT_STATUSES.includes(value.status)
    && value.dissent && typeof value.dissent === 'object';
  return valid ? { valid: true, errors: [] } : { valid: false, errors: ['Dissent id, community, status and body are required.'] };
}

module.exports = { DISSENT_STATUSES, validateDissent };
