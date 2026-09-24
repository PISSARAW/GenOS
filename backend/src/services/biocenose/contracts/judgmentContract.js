'use strict';

function validateJudgment(value) {
  const valid = value && typeof value === 'object' && typeof value.judgmentId === 'string'
    && typeof value.communityId === 'string' && Number.isInteger(value.round) && value.round >= 0
    && typeof value.memberId === 'string' && value.memberId.trim()
    && validBody(value.judgment);
  return valid ? { valid: true, errors: [] } : { valid: false, errors: ['Judgment id, community, non-negative round and body are required.'] };
}

function validBody(value) {
  const lists = ['claims', 'assumptions', 'evidenceRefs', 'unknowns', 'abstentions'];
  return value && typeof value === 'object' && Object.hasOwn(value, 'position')
    && lists.every((key) => Array.isArray(value[key]))
    && Number.isFinite(value.confidence) && value.confidence >= 0 && value.confidence <= 1;
}

module.exports = { validateJudgment };
