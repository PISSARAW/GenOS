'use strict';

function validateJudgment(value) {
  const valid = value && typeof value === 'object' && typeof value.judgmentId === 'string'
    && typeof value.communityId === 'string' && Number.isInteger(value.round) && value.round >= 0
    && value.judgment && typeof value.judgment === 'object';
  return valid ? { valid: true, errors: [] } : { valid: false, errors: ['Judgment id, community, non-negative round and body are required.'] };
}

module.exports = { validateJudgment };
