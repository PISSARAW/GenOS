'use strict';

const { createHash } = require('node:crypto');

function validateRegistry(registry) {
  if (!registry || registry.trustSource !== 'control_plane' || !Array.isArray(registry.verifiers)) {
    throw new Error('trusted-control-plane-verifier-registry-required');
  }
  const ids = new Set(registry.verifiers.map((entry) => entry.id));
  if (ids.size !== registry.verifiers.length || registry.verifiers.some((entry) => !entry.id || typeof entry.verify !== 'function')) {
    throw new Error('verifier-registry-invalid');
  }
}

function digest(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

async function verifyEvidence(options) {
  const { registry, artifactReader, evidence, requirement } = options || {};
  validateRegistry(registry);
  if (typeof artifactReader !== 'function' || !evidence?.artifactRef || !requirement) throw new Error('independent-evidence-input-invalid');
  const verifier = registry.verifiers.find((item) => item.id === evidence.verifierId && item.requirements.includes(requirement));
  if (!verifier) return { verified: false, reason: 'verifier-not-registered' };
  const artifact = await artifactReader({ artifactRef: evidence.artifactRef });
  if (!Buffer.isBuffer(artifact)) return { verified: false, reason: 'artifact-bytes-unavailable' };
  const artifactHash = digest(artifact);
  const result = await verifier.verify({ artifact, artifactHash, requirement, artifactRef: evidence.artifactRef });
  return result?.verified === true ? { verified: true, requirement, verifierId: verifier.id,
    artifactHash, artifactRef: evidence.artifactRef, verifierVersion: verifier.version || 'unversioned' }
    : { verified: false, reason: 'verifier-rejected-artifact', verifierId: verifier.id };
}

module.exports = { validateRegistry, verifyEvidence, digest };
