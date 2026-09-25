'use strict';

function supports(verifier, need, trustedDigests) {
  return trustedDigests.has(verifier.verifierDigest)
    && Array.isArray(verifier.capabilities) && verifier.capabilities.includes(need.capability)
    && typeof verifier.verifyCapability === 'function';
}

function create(verifiers = [], trustedVerifierDigests = []) {
  const trusted = new Set(trustedVerifierDigests);
  return async function verify(input) {
    const verifier = [...verifiers]
      .filter((item) => supports(item, input.need, trusted))
      .sort((left, right) => left.verifierId.localeCompare(right.verifierId))[0];
    if (!verifier) return null;
    const proof = await verifier.verifyCapability(input);
    if (proof?.kind !== 'CAPABILITY_VERIFIED' || proof.verifierDigest !== verifier.verifierDigest
      || !text(proof.evidenceId) || proof.independent !== true || !Array.isArray(proof.evidenceRefs)
      || proof.candidateId !== input.candidate.candidateId || proof.nodeId !== input.node.nodeId
      || proof.capability !== input.need.capability) return null;
    return { ...proof, verifierId: verifier.verifierId };
  };
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

module.exports = { create };
