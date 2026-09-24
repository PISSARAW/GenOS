'use strict';

function validateClaim(value) {
  const valid = validIdentity(value) && validBody(value);
  return valid ? { valid: true, errors: [] } : { valid: false, errors: ['Claim id, community, non-negative round and body are required.'] };
}

function validIdentity(value) {
  return value && typeof value === 'object' && typeof value.claimId === 'string'
    && typeof value.communityId === 'string' && Number.isInteger(value.round) && value.round >= 0;
}

function validBody(value) {
  return value.claim && typeof value.claim === 'object'
    && typeof value.claim.statement === 'string' && value.claim.statement.trim().length > 0;
}

module.exports = { validateClaim };
