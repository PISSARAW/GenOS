'use strict';

const { validateReceipt } = require('../epistemicVerifierReceiptService');

const LEVELS = Object.freeze({
  PROVEN: 'PROVEN',
  VERIFIED: 'VERIFIED',
  EMPIRICALLY_VERIFIED: 'EMPIRICALLY_VERIFIED',
  SOURCE_SUPPORTED: 'SOURCE_SUPPORTED',
  CORROBORATED: 'CORROBORATED',
  PLAUSIBLE: 'PLAUSIBLE',
  SPECULATIVE: 'SPECULATIVE',
  REFUTED: 'REFUTED',
  UNVERIFIED: 'UNVERIFIED',
});

const PROFILE_LEVELS = Object.freeze({
  formal_proof: LEVELS.PROVEN,
  deterministic: LEVELS.VERIFIED,
  empirical: LEVELS.EMPIRICALLY_VERIFIED,
  source: LEVELS.SOURCE_SUPPORTED,
});

function validBoundReceipt(receipt, claim, trustedVerifierDigests) {
  return validateReceipt(receipt, trustedVerifierDigests)
    && receipt.resultId === claim.id
    && receipt.evidenceDigest === claim.evidenceDigest;
}

function verifiedReceipts(claim, receipts, trustedVerifierDigests) {
  return receipts.filter((receipt) => validBoundReceipt(receipt, claim, trustedVerifierDigests));
}

function levelFromReceipts(receipts, verifierProfiles) {
  const independent = receipts.filter((receipt) => receipt.independent === true);
  if (independent.some((receipt) => receipt.status === 'refuted')) return LEVELS.REFUTED;
  const passed = independent.filter((receipt) => receipt.status === 'verified');
  const levels = passed.map((receipt) => PROFILE_LEVELS[verifierProfiles[receipt.verifierDigest]]).filter(Boolean);
  if (levels.includes(LEVELS.PROVEN)) return LEVELS.PROVEN;
  if (levels.includes(LEVELS.VERIFIED)) return LEVELS.VERIFIED;
  if (levels.includes(LEVELS.EMPIRICALLY_VERIFIED)) return LEVELS.EMPIRICALLY_VERIFIED;
  if (levels.includes(LEVELS.SOURCE_SUPPORTED)) return LEVELS.SOURCE_SUPPORTED;
  if (new Set(passed.map((receipt) => receipt.verifierDigest)).size > 1) return LEVELS.CORROBORATED;
  return receipts.length ? LEVELS.PLAUSIBLE : LEVELS.UNVERIFIED;
}

function assessClaim(claim, options = {}) {
  if (!claim || typeof claim.id !== 'string' || typeof claim.evidenceDigest !== 'string') {
    return {
      level: LEVELS.UNVERIFIED,
      reason: 'claim_binding_missing',
      receipts: [],
      promotionEligible: false,
    };
  }
  const trusted = Array.isArray(options.trustedVerifierDigests) ? options.trustedVerifierDigests : [];
  const profiles = options.verifierProfiles && typeof options.verifierProfiles === 'object'
    ? options.verifierProfiles : {};
  const supplied = Array.isArray(options.receipts) ? options.receipts : [];
  const bound = verifiedReceipts(claim, supplied, trusted);
  return {
    level: levelFromReceipts(bound, profiles),
    reason: bound.length ? null : (supplied.length ? 'no_valid_bound_receipt' : 'no_verifier_receipt'),
    receipts: bound.map((receipt) => ({ verifierDigest: receipt.verifierDigest, status: receipt.status })),
    promotionEligible: false,
  };
}

module.exports = { LEVELS, assessClaim };
