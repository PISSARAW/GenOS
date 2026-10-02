'use strict';

const { createHash } = require('node:crypto');
const TRUSTED_REGISTRIES = new WeakSet();
const verifierControlPlane = require('./gvxVerifierControlPlaneRegistry');
require('./gvxBuiltinVerifiers').registerBuiltInVerifiers(verifierControlPlane);

function createControlPlaneRegistry(verifiers) {
  if (!Array.isArray(verifiers)) throw new Error('control-plane-verifiers-required');
  const registry = Object.freeze({ trustSource: 'control_plane', verifiers: Object.freeze([...verifiers]) });
  TRUSTED_REGISTRIES.add(registry);
  return registry;
}

function fromTrustedRegistry(verifierIds) {
  if (!Array.isArray(verifierIds) || !verifierIds.length
      || verifierIds.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new Error('trusted-verifier-identifiers-required');
  }
  const trust = require('./verifierTrustRegistry');
  const entries = verifierIds.map((id) => {
    const registered = trust.getVerifier(id);
    const implementation = verifierControlPlane.resolveVerifierImplementation(id);
    if (!registered || !implementation) {
      throw Object.assign(new Error('trusted-verifier-implementation-unavailable'), {
        code: 'GVX_VERIFIER_IMPLEMENTATION_UNAVAILABLE'
      });
    }
    return { id: registered.id, version: registered.digest,
      requirements: implementation.requirements, verify: implementation.verify };
  });
  return createControlPlaneRegistry(entries);
}

function validateRemoteInputs(verifierIds, options) {
  if (!Array.isArray(verifierIds) || !verifierIds.length
      || verifierIds.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new Error('trusted-verifier-identifiers-required');
  }
  if (!options.url || !options.publicKey || !options.token) {
    throw Object.assign(new Error('remote-gvx-verifier-configuration-required'), {
      code: 'GVX_REMOTE_VERIFIER_CONFIGURATION_REQUIRED'
    });
  }
}

function registerRemoteTrust(entries, trust) {
  for (const entry of entries || []) registerRemoteTrustEntry(entry, trust);
}

function registerRemoteTrustEntry(entry, trust) {
  validateTrustDescriptor(entry);
  const existing = trust.getVerifier(entry.id);
  if (existing && (existing.type !== entry.type || existing.digest !== entry.digest)) {
    throw Object.assign(new Error('remote-gvx-verifier-trust-conflict'), {
      code: 'GVX_REMOTE_VERIFIER_TRUST_INVALID'
    });
  }
  if (!existing) trust.registerVerifier(entry);
}

function validateTrustDescriptor(entry) {
  if (entry?.id && entry.type && /^sha256:[a-f0-9]{64}$/.test(entry.digest || '')) return;
  throw Object.assign(new Error('remote-gvx-verifier-trust-entry-invalid'), {
    code: 'GVX_REMOTE_VERIFIER_TRUST_INVALID'
  });
}

function remoteVerifiers(verifierIds, trust) {
  return verifierIds.map((id) => {
    const registered = trust.getVerifier(id);
    if (!registered) throw new Error('trusted-verifier-identifier-unknown');
    return { id: registered.id, version: registered.digest, requirements: [] };
  });
}

function fromRemoteControlPlane(verifierIds, options = {}) {
  validateRemoteInputs(verifierIds, options);
  const trust = require('./verifierTrustRegistry');
  registerRemoteTrust(options.trustedVerifiers, trust);
  const verifiers = remoteVerifiers(verifierIds, trust);
  const registry = Object.freeze({ trustSource: 'remote_control_plane', verifiers: Object.freeze(verifiers),
    remote: Object.freeze({ url: options.url, publicKey: options.publicKey, token: options.token }) });
  TRUSTED_REGISTRIES.add(registry);
  return registry;
}

function validateRegistry(registry) {
  if (!registry || !TRUSTED_REGISTRIES.has(registry)
      || !['control_plane', 'remote_control_plane'].includes(registry.trustSource)
      || !Array.isArray(registry.verifiers)) {
    throw new Error('trusted-control-plane-verifier-registry-required');
  }
  const ids = new Set(registry.verifiers.map((entry) => entry.id));
  if (ids.size !== registry.verifiers.length || registry.verifiers.some((entry) => !entry.id
      || (!registry.remote && typeof entry.verify !== 'function'))) {
    throw new Error('verifier-registry-invalid');
  }
}

function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

async function verifyEvidence(options) {
  const { registry, artifactReader, evidence, requirement } = options || {};
  validateRegistry(registry);
  if (typeof artifactReader !== 'function' || !evidence?.artifactRef || !requirement) throw new Error('independent-evidence-input-invalid');
  if (registry.remote) return verifyRemotely({ registry, artifactReader, evidence, requirement });
  const verifier = registry.verifiers.find((item) => item.id === evidence.verifierId && item.requirements.includes(requirement));
  if (!verifier) return { verified: false, reason: 'verifier-not-registered' };
  return executeEvidence({ artifactReader, evidence, requirement, verifier });
}

async function verifyRemotely(input) {
  const verifier = input.registry.verifiers.find((item) => item.id === input.evidence.verifierId);
  if (!verifier) return { verified: false, reason: 'verifier-not-registered' };
  const artifact = await input.artifactReader({ artifactRef: input.evidence.artifactRef });
  if (!Buffer.isBuffer(artifact)) return { verified: false, reason: 'artifact-bytes-unavailable' };
  const receipt = await require('./gvxRemoteVerifierClient').verify({
    ...input.registry.remote, evidence: input.evidence, requirement: input.requirement, artifact
  });
  if (!receipt?.verified || receipt.verifierId !== verifier.id
      || receipt.verifierVersion !== verifier.version
      || receipt.artifactHash !== digest(artifact) || receipt.artifactRef !== input.evidence.artifactRef
      || receipt.requirement !== input.requirement) {
    return { verified: false, reason: 'remote-verifier-receipt-invalid' };
  }
  return { verified: true, requirement: receipt.requirement, verifierId: verifier.id,
    artifactHash: receipt.artifactHash, artifactRef: receipt.artifactRef,
    verifierVersion: receipt.verifierVersion, evidenceClass: receipt.evidenceClass,
    signedReceipt: receipt };
}

async function executeEvidence(input) {
  const { artifactReader, evidence, requirement, verifier } = input;
  const artifact = await artifactReader({ artifactRef: evidence.artifactRef });
  if (!Buffer.isBuffer(artifact)) return { verified: false, reason: 'artifact-bytes-unavailable' };
  const artifactHash = digest(artifact);
  const result = await verifier.verify({ artifact, artifactHash, requirement,
    artifactRef: evidence.artifactRef, evidence });
  return result?.verified === true ? { verified: true, requirement, verifierId: verifier.id,
    artifactHash, artifactRef: evidence.artifactRef, verifierVersion: verifier.version || 'unversioned',
    evidenceClass: result.evidenceClass || 'independent_requirement_verification' }
    : { verified: false, reason: 'verifier-rejected-artifact', verifierId: verifier.id };
}

module.exports = { fromTrustedRegistry, fromRemoteControlPlane, validateRegistry, verifyEvidence, digest };
