'use strict';

async function evaluate(input, session, persistedClaims) {
  const result = evaluateAggregation(input, persistedClaims);
  if (input.variantPolicy?.requireHumanReview) {
    result.aggregation = { ...result.aggregation, humanJudgmentRequired: true };
  }
  return {
    aggregation: result.aggregation,
    gate: result.gate,
    dissent: await evaluateDissent(input, session.communityId)
  };
}

function evaluateAggregation(input, persistedClaims) {
  const aggregation = input.aggregation;
  if (aggregation.questionType === 'MIXED') return evaluateMixed(input, aggregation);
  if (aggregation.questionType !== 'FACTUAL') return { aggregation, gate: { status: 'NOT_APPLICABLE' } };
  return evaluateFactual(input, aggregation, persistedClaims);
}

function evaluateMixed(input, aggregation) {
  const results = (aggregation.results || []).map((entry) => {
    const gated = evaluateAggregation({ ...input, aggregation: entry.result,
      persistedClaimIds: entry.claimId ? [entry.claimId] : [] }, []);
    return { ...entry, result: gated.aggregation, promotionGate: gated.gate };
  });
  const blocked = results.some((entry) => entry.promotionGate.status === 'REVIEW_REQUIRED');
  return { aggregation: { ...aggregation, results }, gate: { status: blocked ? 'REVIEW_REQUIRED' : 'ALLOWED' } };
}

function evaluateFactual(input, aggregation, persistedClaims) {
  const receipts = (input.verificationReceipts || []).filter((receipt) => receipt.status === 'VERIFIED'
    && trusted(receipt, input.isTrustedReceipt));
  const required = [...new Set([...(input.persistedClaimIds || persistedClaims.map((item) => item.claimId)),
    ...(aggregation.verifiedClaimIds || [])])];
  const verified = required.filter((claimId) => receipts.some((receipt) => receipt.claimId === claimId));
  const missing = required.filter((claimId) => !verified.includes(claimId));
  if (required.length && !missing.length && isVerifiedOutcome(aggregation.outcome)) {
    return { aggregation, gate: { status: 'ALLOWED', verifiedClaimIds: verified } };
  }
  return reviewRequired(aggregation, verified, missing.length ? missing : required);
}

function reviewRequired(aggregation, verified, blockedIds) {
  return {
    aggregation: { ...aggregation, outcome: 'REVIEW_REQUIRED', verifiedClaimIds: verified,
      unresolvedClaimIds: [...new Set([...(aggregation.unresolvedClaimIds || []), ...blockedIds])] },
    gate: { status: 'REVIEW_REQUIRED', unresolvedClaimIds: blockedIds }
  };
}

function isVerifiedOutcome(outcome) {
  return ['EVIDENCE_SUPPORTED', 'EVIDENCE_WITH_DISSENT'].includes(outcome);
}

async function evaluateDissent(input, communityId) {
  const ledger = require('../dissent/dissentLedger');
  const veto = require('../dissent/minorityEvidenceVetoService');
  const entries = await ledger.list({ db: input.db, communityId });
  return {
    preservedIds: entries.filter((entry) => input.variantPolicy?.preserveAllDissent || isCriticalOpen(entry))
      .map((entry) => entry.dissentId),
    gates: entries.filter(isCriticalOpen).map((dissent) => ({ dissentId: dissent.dissentId,
    ...veto.evaluate({ dissent, receipts: input.verificationReceipts, isTrustedReceipt: input.isTrustedReceipt })
    }))
  };
}

function isCriticalOpen(entry) {
  return ['OPEN', 'ESCALATED', 'VALIDATED'].includes(entry.status)
    && entry.dissent.severity >= 0.8 && entry.dissent.materiality >= 0.8;
}

function trusted(receipt, validator) {
  if (typeof validator !== 'function') return false;
  try { return validator(receipt) === true; } catch (_) { return false; }
}

module.exports = { evaluate };
