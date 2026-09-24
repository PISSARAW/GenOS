'use strict';

const CONSTITUTION_FIELDS = Object.freeze([
  'systemPolicy', 'humanAuthority', 'securitySandbox', 'privacyConstraints',
  'maxAutonomy', 'governanceRequirements'
]);

function createMorphologyConstitution(input = {}) {
  const missing = CONSTITUTION_FIELDS.filter((field) => input[field] === undefined);
  if (missing.length) throw new Error(`missing constitutional fields: ${missing.join(', ')}`);
  return deepFreeze(Object.fromEntries(CONSTITUTION_FIELDS.map((field) => [field, structuredClone(input[field])])));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function assertConstitutionUnchanged(before, after) {
  const changed = CONSTITUTION_FIELDS.filter((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
  return { valid: changed.length === 0, changedFields: changed };
}

module.exports = { CONSTITUTION_FIELDS, assertConstitutionUnchanged, createMorphologyConstitution };
