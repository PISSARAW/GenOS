'use strict';

const { createHash } = require('node:crypto');
const { normalizeCapabilityNode } = require('../contracts/capabilityNode');
const verifierReceipts = require('../../epistemicVerifierReceiptService');

function evidenceDigest(node, proof) {
  const context = node.localContext || {};
  const subject = [node.nodeId, [...node.capabilities].sort(), proof.candidateId, proof.capability,
    [...(proof.evidenceRefs || [])].sort(), proof.independent === true,
    context.classification || context.confidentiality || null,
    context.trustDomain || null, context.boundaryProof || null];
  return `sha256:${createHash('sha256').update(JSON.stringify(subject)).digest('hex')}`;
}

function admit(value, proof, policy = {}) {
  const node = normalizeCapabilityNode(value);
  validateCandidate(node);
  const identity = validateVerifier(node, proof, policy.trustedVerifierDigests || []);
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

function validateVerifier(node, proof, trustedDigests) {
  const evidenceId = typeof proof?.evidenceId === 'string' ? proof.evidenceId.trim() : '';
  const digest = typeof proof?.verifierDigest === 'string' ? proof.verifierDigest.trim() : '';
  if (!verifierIdentityValid({ proof, evidenceId, digest, trustedDigests })
    || !proofMatchesNode(node, proof) || !validSignedEvidence({ node, proof, evidenceId, trustedDigests })) {
    fail('RHIZOME_ADMISSION_EVIDENCE_REQUIRED', 'Capability admission requires verification from a trusted verifier.');
  }
  return { evidenceId };
}

function verifierIdentityValid(input) {
  const { proof, evidenceId, digest, trustedDigests } = input;
  return proof?.kind === 'CAPABILITY_VERIFIED' && Boolean(evidenceId)
    && new Set(trustedDigests).has(digest) && proof.independent === true;
}

function proofMatchesNode(node, proof) {
  return proof.nodeId === node.nodeId && node.capabilities.includes(proof.capability);
}

function validSignedEvidence(input) {
  const { node, proof, evidenceId, trustedDigests } = input;
  const receipt = proof.signedReceipt;
  return Boolean(receipt) && receipt.resultId === evidenceId
    && receipt.verifierDigest === proof.verifierDigest && receipt.status === 'verified' && receipt.independent === true
    && receipt.evidenceDigest === evidenceDigest(node, proof)
    && verifierReceipts.validateReceipt(receipt, trustedDigests);
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

module.exports = { admit, evidenceDigest };
