'use strict';

function validateMember(value) {
  const valid = value && typeof value === 'object' && typeof value.memberId === 'string'
    && value.memberId.trim() && typeof value.role === 'string' && value.role.trim();
  return valid ? { valid: true, errors: [] } : { valid: false, errors: ['Member id and role are required.'] };
}

module.exports = { validateMember };
