'use strict';

const REASON_CODES = Object.freeze([
  'NEW_EVIDENCE', 'COUNTEREXAMPLE', 'FORMAL_REFUTATION', 'BETTER_ARGUMENT',
  'ASSUMPTION_CHANGED', 'SELF_CORRECTION', 'MAJORITY_SIGNAL', 'AUTHORITY_SIGNAL'
]);

function validateBeliefUpdate(value) {
  const valid = hasIdentity(value) && hasRevisionData(value);
  return valid ? { valid: true, errors: [] } : { valid: false, errors: ['Belief update identity, claims, reasons and evidence references are required.'] };
}

function hasIdentity(value) {
  return value && typeof value === 'object' && typeof value.updateId === 'string'
    && typeof value.communityId === 'string' && typeof value.memberId === 'string'
    && Number.isInteger(value.round) && value.round >= 0;
}

function hasRevisionData(value) {
  return Array.isArray(value.changedClaims) && Array.isArray(value.reasonCodes)
    && value.reasonCodes.length > 0 && value.reasonCodes.every((code) => REASON_CODES.includes(code))
    && Array.isArray(value.evidenceRefs);
}

module.exports = { REASON_CODES, validateBeliefUpdate };
