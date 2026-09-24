'use strict';

const ARGUMENT_RELATIONS = Object.freeze([
  'SUPPORT', 'ATTACK', 'REFUTE', 'UNDERCUT', 'QUALIFY', 'DEPENDS_ON', 'COUNTEREXAMPLE'
]);

function validateArgument(value) {
  const valid = value && typeof value === 'object' && typeof value.argumentId === 'string'
    && typeof value.communityId === 'string' && typeof value.claimId === 'string'
    && ARGUMENT_RELATIONS.includes(value.relation) && value.argument && typeof value.argument === 'object';
  return valid ? { valid: true, errors: [] } : { valid: false, errors: ['Argument identity, claim, supported relation and body are required.'] };
}

module.exports = { ARGUMENT_RELATIONS, validateArgument };
