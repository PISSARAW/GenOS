'use strict';

function adaptEvidence(input = {}) {
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];
  const typeMap = input.typeMap || {};
  const required = Array.isArray(input.requiredTypes) ? input.requiredTypes : [];
  const errors = [];
  const adapted = evidence.map((item) => adaptItem(item, typeMap, errors));
  for (const type of required) {
    if (!adapted.some((item) => item.type === type)) errors.push(`required evidence type is missing: ${type}`);
  }
  return { valid: errors.length === 0, errors, evidence: adapted.filter(Boolean) };
}

function adaptItem(item, typeMap, errors) {
  const targetType = typeMap[item.type];
  if (!targetType) {
    errors.push(`evidence type has no adapter mapping: ${item.type}`);
    return null;
  }
  return { ...item, sourceType: item.type, type: targetType };
}

module.exports = { adaptEvidence };
