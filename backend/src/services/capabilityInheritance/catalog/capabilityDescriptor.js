'use strict';

const MODES = new Set(['linked', 'embedded', 'managed']);
const MATURITIES = new Set(['declared', 'integrated', 'verified']);
const Ajv = require('ajv');
const CAPABILITY_SCHEMA = require('../../../../../spec/gci/capability.schema.json');
const validateSchema = new Ajv({ allErrors: true, strict: false }).compile(CAPABILITY_SCHEMA);

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
  validateDescriptorInput(input);
  const capabilityId = requireText(input.capabilityId, 'capabilityId');
  const version = requireText(input.version, 'version');
  const digest = requireText(input.implementationDigest, 'implementationDigest');
  return Object.freeze({
    schema: input.schema, capabilityId, version, implementationDigest: digest,
    provider: Object.freeze({ id: requireText(input.provider.id, 'provider.id'),
      ...(input.provider.projectId ? { projectId: input.provider.projectId } : {}) }),
    maturity: input.maturity, exportModes: Object.freeze([...new Set(input.exportModes)].sort()),
    inputContract: freezeValue(input.inputContract || {}), outputContract: freezeValue(input.outputContract || {}),
    requiredAuthority: Object.freeze([...new Set(input.requiredAuthority || [])].sort()),
    dependencies: Object.freeze((input.dependencies || []).map((dependency) => Object.freeze({
      capabilityId: requireText(dependency.capabilityId, 'dependency.capabilityId'),
      version: requireText(dependency.version, 'dependency.version')
    })).sort((a, b) => a.capabilityId.localeCompare(b.capabilityId))),
    constraints: freezeValue(input.constraints || {}), sideEffects: Object.freeze([...(input.sideEffects || [])].sort()),
    evidence: freezeValue(input.evidence || []), revocationPolicy: freezeValue(input.revocationPolicy || { revocable: true })
  });
}

function validateDescriptorInput(input) {
  if (!input || input.schema !== 'genos.gci.capability/v1') throw invalid('Unsupported GCI capability schema');
  const digest = requireText(input.implementationDigest, 'implementationDigest');
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) throw invalid('implementationDigest must be a sha256 digest');
  if (!input.provider || !input.provider.id) throw invalid('provider.id is required');
  if (!MATURITIES.has(input.maturity)) throw invalid('Unsupported maturity');
  if (!Array.isArray(input.exportModes) || !input.exportModes.length || input.exportModes.some((mode) => !MODES.has(mode))) {
    throw invalid('exportModes must contain supported modes');
  }
  if (!validateSchema(input)) throw invalid(`Capability descriptor violates GCI schema: ${validateSchema.errors[0].message}`);
}

function freezeValue(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeValue));
  if (!value || typeof value !== 'object') return value;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeValue(item)])));
}

module.exports = { createCapabilityDescriptor };
