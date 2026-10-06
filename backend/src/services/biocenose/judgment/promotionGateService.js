'use strict';

const statisticalGate = require('../../morphogenesis/capabilities/statisticalPromotionGate');

async function evaluate(input, session, persistedClaims) {
  const result = evaluateAggregation(input, persistedClaims);
  enforceTypedFacts(input, result, persistedClaims);
  if (input.variantPolicy?.requireHumanReview) {
    result.aggregation = { ...result.aggregation, humanJudgmentRequired: true };
  }
  const dissent = await evaluateDissent(input, session.communityId);
  const gated = await applyStatistical(input, result, dissent);
  return {
    aggregation: gated.aggregation,
    gate: gated.gate,
    dissent
  };
}

function enforceTypedFacts(input, result, persistedClaims) {
  if (['FACTUAL', 'MIXED'].includes(input.aggregation.questionType)) return;
  const classify = require('../question/communityAggregationService').mixedClaimQuestionType;
  const factualIds = persistedClaims.filter((claim) => classify(claim) === 'FACTUAL').map((claim) => claim.claimId);
  if (!factualIds.length) return;
  const receipts = input.verificationReceipts || [];
  const covered = factualIds.every((id) => receipts.some((receipt) => receipt.claimId === id
    && receipt.status === 'VERIFIED' && trusted(receipt, input.isTrustedReceipt)));
  if (!covered) Object.assign(result, reviewRequired(result.aggregation, [], factualIds));
}

async function applyStatistical(input, result, dissent) {
  const nodeId = statisticalNodeId(input);
  const inherited = await require('../../morphogenesis/capabilities/riskLineage').node(input.db, nodeId);
  if (!input.statisticalContract && !inherited) return result;
  if (result.gate.status === 'NOT_APPLICABLE') {
    return statisticalReview(result, 'STATISTICAL_SCOPE_NOT_APPLICABLE');
  }
  if (result.gate.status !== 'ALLOWED' || dissent.gates.some((gate) => gate.promotion !== 'ALLOWED')) {
    return result;
  }
  const statistical = await statisticalGate.evaluateForNode(input.db, { nodeId, contract: input.statisticalContract });
  if (!statistical.allowed) return statisticalReview(result, statistical.reason);
  return { ...result, gate: { ...result.gate, statistical } };
}

function statisticalReview(result, reason) {
  return { aggregation: { ...result.aggregation, outcome: 'REVIEW_REQUIRED' },
    gate: { status: 'REVIEW_REQUIRED', reason } };
}

function evaluateAggregation(input, persistedClaims) {
  const aggregation = input.aggregation;
  if (aggregation.questionType === 'MIXED') return evaluateMixed(input, aggregation, persistedClaims);
  if (aggregation.questionType !== 'FACTUAL') return { aggregation, gate: { status: 'NOT_APPLICABLE' } };
  return evaluateFactual(input, aggregation, persistedClaims);
}

function evaluateMixed(input, aggregation, persistedClaims) {
  const claimType = require('../question/communityAggregationService').mixedClaimQuestionType;
  const required = persistedClaims.map((claim) => claim.claimId);
  const supplied = (aggregation.results || []).map((entry) => entry.claimId);
  const coverage = required.length > 0 && required.length === supplied.length
    && new Set(supplied).size === supplied.length && required.every((id) => supplied.includes(id));
  if (!coverage) return reviewRequired(aggregation, [], required);
  const results = aggregation.results.map((entry) => {
    const claim = persistedClaims.find((item) => item.claimId === entry.claimId);
    const result = { ...entry.result, questionType: claimType(claim) };
    const gated = evaluateAggregation({ ...input, aggregation: result,
      persistedClaimIds: [entry.claimId] }, [claim]);
    return { ...entry, result: gated.aggregation, promotionGate: gated.gate };
  });
  const blocked = results.some((entry) => entry.promotionGate.status === 'REVIEW_REQUIRED');
  return { aggregation: { ...aggregation, results,
    humanJudgmentRequired: results.some((entry) => require('./outcomeAssessment').needsHuman(entry.result)) },
    gate: { status: blocked ? 'REVIEW_REQUIRED' : 'ALLOWED' } };
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
  return ['EVIDENCE_SUPPORTED', 'EVIDENCE_WITH_DISSENT', 'ARGUMENTS_ACCEPTED',
    'POLYCENTRIC_JUDGMENT', 'REPRESENTATIVE_DISTRIBUTION'].includes(outcome);
}

async function evaluateDissent(input, communityId) {
  const ledger = require('../dissent/dissentLedger');
  const veto = require('../dissent/minorityEvidenceVetoService');
  const entries = await ledger.list({ db: input.db, communityId });
  return {
    preservedIds: entries.filter((entry) => input.variantPolicy?.preserveAllDissent || entry.dissent.materiality >= 0.3)
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

module.exports = { evaluate, applyStatistical };

function statisticalNodeId(input) { return input.riskNodeId || input.nodeId || input.sessionId; }
