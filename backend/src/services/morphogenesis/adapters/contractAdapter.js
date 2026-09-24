'use strict';

function adaptContract(input = {}) {
  const source = input.contract || {};
  const fieldMap = input.fieldMap || {};
  const required = Array.isArray(input.requiredFields) ? input.requiredFields : [];
  const contract = {};
  const errors = [];
  for (const [sourceField, targetField] of Object.entries(fieldMap)) {
    if (Object.prototype.hasOwnProperty.call(source, sourceField)) contract[targetField] = source[sourceField];
  }
  for (const field of required) {
    if (!Object.prototype.hasOwnProperty.call(contract, field)) errors.push(`required target contract field is missing: ${field}`);
  }
  return { valid: errors.length === 0, errors, contract };
}

module.exports = { adaptContract };
