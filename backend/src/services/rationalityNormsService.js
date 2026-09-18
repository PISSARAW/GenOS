'use strict';

const { validateClaim } = require('./epistemic/core');
const { validateClaimAgainstRules } = require('./epistemic/validator');

function evaluateRationality(args = {}) {
  const claim = args.claim;
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) throw new Error('rationalityNormsService requires a claim object.');
  const shape = validateClaim(claim);
  const validation = validateClaimAgainstRules(claim, { stakes: args.stakes, tails: args.tails });
  const norm = validation.verdict === 'accept' || validation.verdict === 'requires_debt';
  return {
    claimId: claim.id || null,
    rational: norm,
    verdict: validation.verdict,
    evidenceQuality: validation.evidenceQuality,
    calibratedConfidence: validation.calibratedConfidence,
    reasons: [...shape.errors, ...validation.reasons],
    promotionEligible: false,
    limitation: 'Cette analyse évalue la cohérence avec des normes déclarées ; elle ne prouve pas la vérité du claim.'
  };
}

module.exports = { evaluateRationality };
