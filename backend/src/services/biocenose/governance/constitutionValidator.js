'use strict';

const { validateConstitution } = require('../contracts/constitutionContract');

function assertValidConstitution(record) {
  const result = validateConstitution(record);
  if (result.valid) return record;
  throw Object.assign(new Error(`Invalid Biocenose constitution: ${result.errors.join(' ')}`), {
    code: 'BIOCENOSE_CONSTITUTION_INVALID', details: result.errors
  });
}

module.exports = { assertValidConstitution };
