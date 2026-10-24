'use strict';

const { createHash, randomUUID } = require('node:crypto');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const LOCKFILE_SCHEMA = require('../../../../../spec/gci/lockfile.schema.json');

const schemaValidator = new Ajv({ allErrors: true, strict: false });
addFormats(schemaValidator);
const validateLockfile = schemaValidator.compile(LOCKFILE_SCHEMA);

function lockedCapability(input) {
  assertLockfile(input.lockfile);
  if (input.lockfile.projectId !== input.projectId || input.lockfile.environment !== input.environment) {
    throw adapterError('GCI_PROJECT_SCOPE_DENIED');
  }
  const capability = input.lockfile.capabilities.find((entry) => entry.capabilityId === input.capabilityId);
  if (!capability || capability.mode !== input.mode) throw adapterError('GCI_CAPABILITY_MODE_DENIED');
  return capability;
}

function assertLockfile(lockfile) {
  if (!validateLockfile(lockfile)) throw adapterError('GCI_LOCKFILE_INVALID');
  const canonical = JSON.stringify({ projectId: lockfile.projectId, environment: lockfile.environment,
    capabilities: lockfile.capabilities });
  const digest = `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
  if (digest !== lockfile.graphDigest) throw adapterError('GCI_LOCKFILE_CHANGED');
}

async function assertAuthority(input) {
  if (typeof input.getProjectAuthority !== 'function') throw adapterError('GCI_AUTHORITY_UNAVAILABLE');
  const authority = await input.getProjectAuthority({
    organizationId: input.organizationId, projectId: input.projectId
  });
  if (!Array.isArray(authority)) throw adapterError('GCI_AUTHORITY_UNAVAILABLE');
  for (const capability of dependencyEntries(input.capability, input.lockfile, new Set())) {
    const excess = capability.effectiveAuthority.filter((item) => !authority.includes(item));
    if (excess.length) throw adapterError('GCI_AUTHORITY_REVOKED');
  }
}

function dependencyEntries(capability, lockfile, visited) {
  const key = `${capability.capabilityId}@${capability.version}`;
  if (visited.has(key)) throw adapterError('GCI_LOCKFILE_CYCLE');
  visited.add(key);
  const entries = [capability];
  for (const dependency of capability.dependencies || []) {
    const entry = lockfile.capabilities.find((candidate) => `${candidate.capabilityId}@${candidate.version}` === dependency);
    if (!entry) throw adapterError('GCI_LOCKFILE_DEPENDENCY_MISSING');
    entries.push(...dependencyEntries(entry, lockfile, visited));
  }
  visited.delete(key);
  return entries;
}

async function assertNoRevocation(input) {
  const { capability, lockfile, isRevoked, visited } = input;
  if (typeof isRevoked !== 'function') throw adapterError('GCI_REVOCATION_SOURCE_UNAVAILABLE');
  const key = `${capability.capabilityId}@${capability.version}`;
  if (visited.has(key)) throw adapterError('GCI_LOCKFILE_CYCLE');
  if (await isRevoked({ ...input.scope, capabilityId: capability.capabilityId, version: capability.version })) {
    throw adapterError('GCI_CAPABILITY_REVOKED');
  }
  visited.add(key);
  for (const dependency of capability.dependencies || []) {
    const entry = lockfile.capabilities.find((candidate) => `${candidate.capabilityId}@${candidate.version}` === dependency);
    if (!entry) throw adapterError('GCI_LOCKFILE_DEPENDENCY_MISSING');
    await assertNoRevocation({ ...input, capability: entry });
  }
  visited.delete(key);
}

function assertDescriptor(input) {
  if (input.descriptor.capabilityId !== input.capability.capabilityId
    || input.descriptor.version !== input.capability.version
    || input.descriptor.implementationDigest !== input.capability.implementationDigest
    || !Array.isArray(input.descriptor.exportModes)
    || !input.descriptor.exportModes.includes(input.mode)) throw adapterError('GCI_ARTIFACT_CHANGED');
}

function validateContract(schema, value, code) {
  let valid = false;
  try { valid = new Ajv({ allErrors: true, strict: false }).compile(schema || {})(value); }
  catch { throw adapterError('GCI_CONTRACT_INVALID'); }
  if (!valid) throw adapterError(code);
}

function invocationReceipt(input) {
  return Object.freeze({ schema: 'genos.gci.invocation-receipt/v1', id: randomUUID(),
    organizationId: input.organizationId, projectId: input.projectId, environment: input.environment,
    capabilityId: input.capability.capabilityId, version: input.capability.version, mode: input.mode,
    implementationDigest: input.capability.implementationDigest,
    authority: input.capability.effectiveAuthority,
    resultDigest: `sha256:${createHash('sha256').update(JSON.stringify(input.result)).digest('hex')}`,
    outcome: input.outcome || 'completed' });
}

function adapterError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

module.exports = { lockedCapability, assertAuthority, assertNoRevocation, assertDescriptor,
  validateContract, invocationReceipt, adapterError };
