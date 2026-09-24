'use strict';

const { routeAggregationPolicy } = require('./aggregationPolicyRouter');

function aggregate(input) {
  const route = routeAggregationPolicy(input.questionType);
  const handlers = {
    verified_evidence: factual,
    calibrated_probability_pooling: probability,
    evidence_informed_design_review: design,
    pareto_options: pareto,
    pluralism_with_human_judgment: normative,
    claim_map: exploratory,
    type_specific_plural_judgment: mixed
  };
  return { policy: route.policy, questionType: route.questionType, ...handlers[route.policy](input) };
}

function factual(input) {
  const receipts = (input.verificationReceipts || []).filter((item) => item.status === 'VERIFIED');
  const claims = input.claims || [];
  const verifiedClaimIds = claims.filter((claim) => receipts.some((item) => item.claimId === claim.claimId))
    .map((claim) => claim.claimId);
  const unresolvedClaimIds = claims.map((claim) => claim.claimId).filter((id) => !verifiedClaimIds.includes(id));
  if (!verifiedClaimIds.length) return { outcome: 'UNRESOLVED', verifiedEvidence: [], unresolvedClaimIds: claimIds(claims) };
  return {
    outcome: input.dissent?.length ? 'EVIDENCE_WITH_DISSENT' : 'EVIDENCE_SUPPORTED',
    verifiedEvidence: receipts.filter((item) => verifiedClaimIds.includes(item.claimId)),
    verifiedClaimIds, unresolvedClaimIds
  };
}

function probability(input) {
  const values = (input.forecasts || []).filter((item) => validForecast(item)
    && (!input.variantPolicy?.requireCalibrationWeights || hasCalibrationWeights(item)));
  if (!values.length) return { outcome: 'INSUFFICIENT_FORECASTS', estimates: [] };
  const eventIds = [...new Set(values.map((item) => item.eventId))];
  return {
    outcome: 'PROBABILITY_ESTIMATE',
    estimates: eventIds.map((eventId) => poolEvent(eventId, values.filter((item) => item.eventId === eventId)))
  };
}

function hasCalibrationWeights(item) {
  return Number.isFinite(item.calibrationWeight) && item.calibrationWeight > 0
    && Number.isFinite(item.independenceWeight) && item.independenceWeight > 0;
}

function poolEvent(eventId, forecasts) {
  const weighted = forecasts.every((item) => Number.isFinite(item.calibrationWeight) && item.calibrationWeight > 0
    && Number.isFinite(item.independenceWeight) && item.independenceWeight > 0);
  const totalWeight = forecasts.reduce((sum, item) => sum + (weighted ? item.calibrationWeight * item.independenceWeight : 1), 0);
  const probabilityValue = forecasts.reduce((sum, item) => {
    const weight = weighted ? item.calibrationWeight * item.independenceWeight : 1;
    return sum + item.probability * weight;
  }, 0) / totalWeight;
  return { eventId, probability: probabilityValue, memberCount: forecasts.length, weighting: weighted ? 'calibration_and_independence' : 'equal_fallback' };
}

function design(input) {
  const result = pareto(input);
  return { ...result, outcome: 'DESIGN_OPTIONS_REVIEW', verifiedEvidence: input.verificationReceipts || [] };
}

function pareto(input) {
  const options = input.options || [];
  const criteria = input.criteria || [];
  const front = options.filter((candidate) => !options.some((other) => other !== candidate
    && dominates(other, candidate, criteria)));
  return { outcome: front.length ? 'PARETO_FRONT' : 'NO_COMPARABLE_OPTIONS', options: front.map((item) => item.optionId) };
}

function dominates(left, right, criteria) {
  if (!criteria.length) return false;
  const values = criteria.map((item) => criterionGap(left, right, item));
  return values.every((gap) => gap >= 0) && values.some((gap) => gap > 0);
}

function criterionGap(left, right, criterion) {
  const key = typeof criterion === 'string' ? criterion : criterion.key;
  const direction = criterion.direction === 'min' ? -1 : 1;
  return (Number(left.criteria?.[key]) - Number(right.criteria?.[key])) * direction;
}

function normative(input) {
  const perspectives = (input.judgments || []).map((item) => ({ memberId: item.memberId, position: item.judgment?.position }));
  return { outcome: 'PLURALISM_PRESERVED', perspectives, humanJudgmentRequired: true };
}

function exploratory(input) {
  return { outcome: 'CLAIM_MAP', claims: input.claims || [], openQuestions: input.openQuestions || [] };
}

function mixed(input) {
  return {
    outcome: 'TYPE_SPECIFIC_RESULTS',
    results: (input.claims || []).map(mixedClaimResult(input))
  };
}

function mixedClaimResult(input) {
  return (claim) => {
    const type = claim.questionType && claim.questionType !== 'MIXED' ? claim.questionType : 'EXPLORATORY';
    return { claimId: claim.claimId, result: aggregate({ ...input, questionType: type, claims: [claim] }) };
  };
}

function validForecast(item) {
  return typeof item.eventId === 'string' && Number.isFinite(item.probability)
    && item.probability >= 0 && item.probability <= 1;
}

function claimIds(claims) {
  return (claims || []).map((claim) => claim.claimId).filter(Boolean);
}

module.exports = { aggregate };
