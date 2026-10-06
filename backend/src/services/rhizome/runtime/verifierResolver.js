'use strict';

const bounded = require('./boundedOperationService');

function supports(verifier, need, trustedDigests) {
  return trustedDigests.has(verifier.verifierDigest)
    && Array.isArray(verifier.capabilities) && verifier.capabilities.includes(need.capability)
    && typeof verifier.verifyCapability === 'function';
}

function create(verifiers = [], trustedVerifierDigests = []) {
  const trusted = new Set(trustedVerifierDigests);
  const resolve = async function verify(input) {
    const verifier = [...verifiers]
      .filter((item) => supports(item, input.need, trusted))
      .sort((left, right) => left.verifierId.localeCompare(right.verifierId))[0];
    if (!verifier) return null;
    const proof = await bounded.run(verifier.verifyCapability, verifierContext(input));
    if (proof?.kind !== 'CAPABILITY_VERIFIED' || proof.verifierDigest !== verifier.verifierDigest
      || !text(proof.evidenceId) || proof.independent !== true || !Array.isArray(proof.evidenceRefs)
      || proof.candidateId !== input.candidate.candidateId || proof.nodeId !== input.node.nodeId
      || proof.capability !== input.need.capability) return null;
    return { ...proof, verifierId: verifier.verifierId };
  };
  resolve.available = input => verifiers.some(item => supports(item, input.need, trusted));
  return resolve;
}

function verifierContext(input) {
  return { candidate: structuredClone(input.candidate), node: structuredClone(input.node),
    need: structuredClone(input.need), edges: structuredClone(input.edges), deadline: input.options?.deadline };
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

module.exports = { create };
