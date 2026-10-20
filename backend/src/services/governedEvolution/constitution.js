'use strict';

const crypto = require('node:crypto');

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function digest(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function requiredText(value, field) {
  const text = String(value || '').trim();
  if (text) return text;
  throw Object.assign(new Error(`${field} is required`), { code: 'GOVERNED_EVOLUTION_INVALID' });
}

function sealConstitution(input) {
  const constitution = {
    constitutionId: requiredText(input.constitutionId, 'constitutionId'),
    version: requiredText(input.version, 'version'),
    protectedPathPrefixes: [...new Set(input.protectedPathPrefixes || [])].sort(),
    immutableRules: [...new Set(input.immutableRules || [])].sort()
  };
  if (!constitution.protectedPathPrefixes.length || !constitution.immutableRules.length) {
    throw Object.assign(new Error('Constitution requires protected paths and immutable rules'), {
      code: 'GOVERNED_EVOLUTION_CONSTITUTION_INCOMPLETE'
    });
  }
  return Object.freeze({ ...constitution, constitutionHash: digest(constitution) });
}

function verifyConstitution(sealed) {
  const { constitutionHash, ...constitution } = sealed || {};
  return Boolean(constitutionHash) && digest(constitution) === constitutionHash;
}

function touchesProtectedPath(operation, sealed) {
  const path = String(operation.path || '').replaceAll('\\', '/');
  return sealed.protectedPathPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

module.exports = { digest, sealConstitution, verifyConstitution, touchesProtectedPath };
