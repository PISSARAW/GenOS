'use strict';

function validateClaim(value) {
  const valid = value && typeof value === 'object' && typeof value.claimId === 'string'
    && typeof value.communityId === 'string' && Number.isInteger(value.round) && value.round >= 0
    && value.claim && typeof value.claim === 'object';
  return valid ? { valid: true, errors: [] } : { valid: false, errors: ['Claim id, community, non-negative round and body are required.'] };
}

module.exports = { validateClaim };
