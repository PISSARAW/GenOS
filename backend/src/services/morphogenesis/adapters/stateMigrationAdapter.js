'use strict';

function migrateState(input = {}) {
  const errors = [];
  if (input.sourceVersion === input.targetVersion) errors.push('state migration requires a version change');
  const source = input.state && typeof input.state === 'object' ? input.state : {};
  const mapping = input.keyMap || {};
  const required = Array.isArray(input.requiredKeys) ? input.requiredKeys : [];
  const result = {};
  for (const [sourceKey, value] of Object.entries(source)) {
    const targetKey = mapping[sourceKey];
    if (!targetKey) {
      if (required.includes(sourceKey)) errors.push(`required state key has no mapping: ${sourceKey}`);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(result, targetKey)) errors.push(`state migration key collision: ${targetKey}`);
    else result[targetKey] = value;
  }
  return { valid: errors.length === 0, errors, state: result, sourceVersion: input.sourceVersion, targetVersion: input.targetVersion };
}

module.exports = { migrateState };
