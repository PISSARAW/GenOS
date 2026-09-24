'use strict';

function validateConstitution(value) {
  const valid = value && typeof value === 'object' && typeof value.constitutionId === 'string'
    && typeof value.communityId === 'string' && Number.isInteger(value.version) && value.version > 0
    && value.constitution && typeof value.constitution === 'object' && typeof value.constitutionHash === 'string';
  return valid ? { valid: true, errors: [] } : { valid: false, errors: ['Constitution id, community, positive version, body and hash are required.'] };
}

module.exports = { validateConstitution };
