'use strict';

const MODES = new Set(['linked', 'embedded', 'managed']);
const MATURITIES = new Set(['declared', 'integrated', 'verified']);

function invalid(message) {
  const error = new Error(message);
  error.code = 'GCI_INVALID_DESCRIPTOR';
  return error;
}

function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw invalid(`${field} must be a non-empty string`);
  return value.trim();
}

function createCapabilityDescriptor(input) {
  if (!input || input.schema !== 'genos.gci.capability/v1') throw invalid('Unsupported GCI capability schema');
  const capabilityId = requireText(input.capabilityId, 'capabilityId');
  const version = requireText(input.version, 'version');
  const digest = requireText(input.implementationDigest, 'implementationDigest');
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw invalid('implementationDigest must be a sha256 digest');
  if (!input.provider || !input.provider.id) throw invalid('provider.id is required');
  if (!MATURITIES.has(input.maturity)) throw invalid('Unsupported maturity');
  if (!Array.isArray(input.exportModes) || !input.exportModes.length || input.exportModes.some((mode) => !MODES.has(mode))) {
    throw invalid('exportModes must contain supported modes');
  }
  return Object.freeze({
    schema: input.schema, capabilityId, version, implementationDigest: digest,
    provider: Object.freeze({ id: requireText(input.provider.id, 'provider.id'), projectId: input.provider.projectId || null }),
    maturity: input.maturity, exportModes: Object.freeze([...new Set(input.exportModes)].sort()),
    inputContract: input.inputContract || {}, outputContract: input.outputContract || {},
    requiredAuthority: Object.freeze([...new Set(input.requiredAuthority || [])].sort()),
    dependencies: Object.freeze((input.dependencies || []).map((dependency) => Object.freeze({
      capabilityId: requireText(dependency.capabilityId, 'dependency.capabilityId'),
      version: requireText(dependency.version, 'dependency.version')
    })).sort((a, b) => a.capabilityId.localeCompare(b.capabilityId))),
    constraints: input.constraints || {}, sideEffects: Object.freeze([...(input.sideEffects || [])].sort()),
    evidence: Object.freeze([...(input.evidence || [])]), revocationPolicy: Object.freeze(input.revocationPolicy || { revocable: true })
  });
}

module.exports = { createCapabilityDescriptor };
