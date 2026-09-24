'use strict';

const { normalizeCapabilityNode } = require('../contracts/capabilityNode');

function admit(value, proof, policy = {}) {
  const node = normalizeCapabilityNode(value);
  validateCandidate(node);
  const identity = validateVerifier(proof, policy.trustedVerifierDigests || []);
  validateProviders(node, policy.trustedProviderIds || []);
  validateRequirements(node, proof.evidenceRefs || []);
  const checkedAt = validDate(proof.verifiedAt);
  return {
    ...node,
    state: 'ACTIVE',
    availability: { status: 'AVAILABLE', checkedAt },
    provenance: [...new Set([...node.provenance, `admission:${identity.evidenceId}`])]
  };
}

function validateCandidate(node) {
  if (!['DISCOVERED', 'DEGRADED'].includes(node.state)) {
    fail('RHIZOME_ADMISSION_STATE_INVALID', `Cannot admit a node in state '${node.state}'.`);
  }
  if (!node.providers.length) fail('RHIZOME_ADMISSION_PROVIDER_REQUIRED', 'Capability admission requires at least one provider.');
}

function validateVerifier(proof, trustedDigests) {
  const evidenceId = typeof proof?.evidenceId === 'string' ? proof.evidenceId.trim() : '';
  const digest = typeof proof?.verifierDigest === 'string' ? proof.verifierDigest.trim() : '';
  if (proof?.kind !== 'CAPABILITY_VERIFIED' || !evidenceId || !new Set(trustedDigests).has(digest)) {
    fail('RHIZOME_ADMISSION_EVIDENCE_REQUIRED', 'Capability admission requires verification from a trusted verifier.');
  }
  return { evidenceId };
}

function validateProviders(node, trustedProviders) {
  const trusted = new Set(trustedProviders);
  const untrusted = node.providers.filter((provider) => !trusted.has(provider.providerId));
  if (untrusted.length) fail('RHIZOME_ADMISSION_PROVIDER_UNTRUSTED', `Untrusted providers: ${untrusted.map((provider) => provider.providerId).join(', ')}`);
}

function validateRequirements(node, evidenceRefs) {
  const evidence = new Set(evidenceRefs);
  const missing = node.evidenceRequirements.filter((requirement) => !evidence.has(requirement));
  if (missing.length) fail('RHIZOME_ADMISSION_REQUIREMENTS_UNMET', `Missing evidence: ${missing.join(', ')}`);
}

function validDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) fail('RHIZOME_ADMISSION_DATE_INVALID', 'Verification timestamp is invalid.');
  return date.toISOString();
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

module.exports = { admit };
