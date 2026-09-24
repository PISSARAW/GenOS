'use strict';

function supports(verifier, need, trustedDigests) {
  return trustedDigests.has(verifier.verifierDigest)
    && verifier.capabilities.includes(need.capability)
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
    if (proof?.kind !== 'CAPABILITY_VERIFIED' || proof.verifierDigest !== verifier.verifierDigest) return null;
    if (!Array.isArray(proof.evidenceRefs)) return null;
    return { ...proof, verifierId: verifier.verifierId };
  };
}

module.exports = { create };
