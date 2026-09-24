'use strict';

const ARGUMENT_RELATIONS = Object.freeze([
  'SUPPORT', 'ATTACK', 'REFUTE', 'UNDERCUT', 'QUALIFY', 'DEPENDS_ON', 'COUNTEREXAMPLE'
]);

function validateArgument(value) {
  const valid = hasIdentity(value) && hasSupportedBody(value);
  return valid ? { valid: true, errors: [] } : { valid: false, errors: ['Argument identity, claim, supported relation and body are required.'] };
}

function hasIdentity(value) {
  return value && typeof value === 'object' && typeof value.argumentId === 'string'
    && typeof value.communityId === 'string' && typeof value.claimId === 'string'
    && ARGUMENT_RELATIONS.includes(value.relation);
}

function hasSupportedBody(value) {
  return value.argument && typeof value.argument === 'object'
    && typeof value.argument.statement === 'string' && value.argument.statement.trim().length > 0
    && (!value.argument.targetClaimId || typeof value.argument.targetClaimId === 'string');
}

module.exports = { ARGUMENT_RELATIONS, validateArgument };
