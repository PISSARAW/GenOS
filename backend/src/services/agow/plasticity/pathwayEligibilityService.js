'use strict';

const DEFAULT_TRACE_DECAY = 0.8;
const CONSOLIDATION_SUPPORT = 3;

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function initialPathway(pathwayId, contextHash, now) {
  return { pathwayId, contextHash, fastWeight: 0.5, slowWeight: 0.5,
    eligibilityTrace: 0, supportCount: 0, failureCount: 0, predictionError: 0,
    status: 'novel', expiresAt: now + 7 * 24 * 60 * 60 * 1000, evidenceRefs: [] };
}

function statusFor(pathway, now) {
  if (pathway.expiresAt <= now && pathway.status !== 'consolidated') return 'degraded';
  if (pathway.status === 'consolidated') return 'consolidated';
  if (pathway.supportCount >= CONSOLIDATION_SUPPORT) return 'consolidating';
  return pathway.supportCount > 0 ? 'provisional' : 'novel';
}

function surpriseFrom(input) {
  const signals = [input.predictionError, input.positiveSurprise, input.allostaticImprovement, input.regretReduction]
    .map((value) => clamp(Math.abs(Number(value) || 0)));
  signals.push(input.criticalProblemSolved === true ? 1 : 0);
  return Math.max(...signals);
}

function validatedReward(input, uniqueReceipt) {
  const verified = input.evidenceStatus === 'verified' && input.evidenceRefs?.length > 0;
  if (!verified || (input.receiptId && !uniqueReceipt)) return 0;
  return input.success === true ? clamp(input.reward ?? 0.5) : 0;
}

function failedValidation(input) {
  return input.evidenceStatus === 'verified' && input.evidenceRefs?.length > 0 && input.success === false;
}

function updatePathway(existing, input) {
  const now = Number(input.now) || Date.now();
  const current = existing || initialPathway(input.pathwayId, input.contextHash || 'global', now);
  if (input.receiptId && (current.consumedReceiptIds || current.verifiedReceiptIds || []).includes(input.receiptId)) return current;
  const updated = { ...current, ...pathwayUpdate(current, input, now) };
  updated.status = statusFor(updated, now);
  return updated;
}

function pathwayUpdate(current, input, now) {
  const surprise = surpriseFrom(input);
  const priorReceiptIds = current.verifiedReceiptIds || [];
  const reward = validatedReward(input, isNewReceipt(input, priorReceiptIds));
  const failure = failedValidation(input);
  return { predictionError: surprise,
    eligibilityTrace: clamp(current.eligibilityTrace * DEFAULT_TRACE_DECAY + Math.max(surprise, reward)),
    fastWeight: clamp(current.fastWeight + (reward ? reward * 0.1 : failure ? -0.1 : 0)),
    supportCount: current.supportCount + (reward > 0 ? 1 : 0),
    failureCount: current.failureCount + (failure ? 1 : 0),
    verifiedReceiptIds: newReceiptIds(priorReceiptIds, input, reward),
    consumedReceiptIds: consumedReceipts(current, input),
    evidenceRefs: [...new Set([...(current.evidenceRefs || []), ...(input.evidenceRefs || [])])].slice(-50),
    expiresAt: now + 7 * 24 * 60 * 60 * 1000 };
}

function isNewReceipt(input, priorIds) { return Boolean(input.receiptId && !priorIds.includes(input.receiptId)); }
function newReceiptIds(priorIds, input, reward) { return reward > 0 ? [...priorIds, input.receiptId].slice(-1000) : priorIds; }

function consolidate(existing, input) {
  if (!existing || (existing.verifiedReceiptIds || []).length < CONSOLIDATION_SUPPORT
      || input.evidenceStatus !== 'verified') {
    return { consolidated: false, reason: 'insufficient_validated_support', pathway: existing || null };
  }
  if (existing.status === 'consolidated') return { consolidated: true, replayed: true, pathway: existing };
  const plasticity = require('../../proceduralPlasticityService');
  const synapse = plasticity.applyLTP({ id: existing.pathwayId, weight: existing.slowWeight }, {
    success: 1, evidence: 1, safety: 1, causalEffect: 1, cost: 0, episodeCount: existing.supportCount
  });
  return { consolidated: true, pathway: { ...existing, slowWeight: synapse.weight,
    status: 'consolidated', lastValidatedAt: Number(input.now) || Date.now() } };
}

module.exports = { updatePathway, consolidate, initialPathway, DEFAULT_TRACE_DECAY, CONSOLIDATION_SUPPORT };

function consumedReceipts(current, input) {
  const ids = current.consumedReceiptIds || current.verifiedReceiptIds || [];
  return input.receiptId && input.evidenceStatus === 'verified' ? [...ids, input.receiptId] : ids;
}
