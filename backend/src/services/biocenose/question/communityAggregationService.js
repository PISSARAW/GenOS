'use strict';

const { routeAggregationPolicy } = require('./aggregationPolicyRouter');

function aggregate(input) {
  const route = routeAggregationPolicy(input.questionType);
  if (input.variantPolicy?.name === 'argumentation_community') return argumentation(input, route);
  if (input.variantPolicy?.name === 'polycentric_council') return polycentric(input, route);
  const handlers = {
    verified_evidence: factual,
    calibrated_probability_pooling: probability,
    evidence_informed_design_review: design,
    pareto_options: pareto,
    pluralism_with_human_judgment: normative,
    claim_map: exploratory,
    type_specific_plural_judgment: mixed
  };
  const result = { policy: route.policy, questionType: route.questionType, ...handlers[route.policy](input) };
  return input.variantPolicy?.name === 'delphi_community' ? withDelphiDistribution(result, input) : result;
}

function withDelphiDistribution(result, input) {
  const positions = (input.judgments || []).map((item) => Number(item.judgment?.position))
    .filter((value, index) => hasNumericPosition(input.judgments[index].judgment?.position))
    .filter(Number.isFinite).sort((left, right) => left - right);
  return {
    ...result,
    delphi: {
      anonymous: true, participantCount: (input.judgments || []).length,
      distribution: positionCounts(input.judgments || []),
      numeric: positions.length > 0,
      interquartileRange: positions.length ? quantile(positions, 0.75) - quantile(positions, 0.25) : null,
      median: positions.length ? quantile(positions, 0.5) : null
    }
  };
}

function hasNumericPosition(value) {
  return (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
    && Number.isFinite(Number(value));
}

function positionCounts(judgments) {
  const counts = new Map();
  for (const item of judgments) {
    const position = String(item.judgment?.position ?? 'ABSTAIN');
    counts.set(position, (counts.get(position) || 0) + 1);
  }
  return [...counts].map(([position, count]) => ({ position, count }));
}

function quantile(values, probability) {
  const index = (values.length - 1) * probability;
  const lower = Math.floor(index);
  const fraction = index - lower;
  return values[lower] + (values[Math.ceil(index)] - values[lower]) * fraction;
}

function argumentation(input, route) {
  const semantics = require('../argumentation/argumentationSemantics');
  const labels = semantics.evaluate({
    claims: input.claims, arguments: input.arguments,
    verifiedClaimIds: (input.verificationReceipts || []).filter((item) => item.status === 'VERIFIED').map((item) => item.claimId)
  });
  const unresolvedClaimIds = labels.filter((item) => item.status !== 'ACCEPTED').map((item) => item.claimId);
  const hasClaims = (input.claims || []).length > 0;
  return {
    policy: route.policy, questionType: route.questionType,
    outcome: unresolvedClaimIds.length || !hasClaims ? 'ARGUMENTS_UNRESOLVED' : 'ARGUMENTS_ACCEPTED', unresolvedClaimIds,
    argumentation: { semantics: 'grounded_single_step', labels, unresolvedClaimIds,
      contradictions: labels.filter((item) => item.contradiction).map((item) => item.claimId) }
  };
}

function polycentric(input, route) {
  const clusters = Array.isArray(input.clusters) ? input.clusters : [];
  const hierarchical = require('../deliberation/hierarchicalDeliberationService');
  const judgment = hierarchical.aggregateAtParent({ clusters, isTrustedReceipt: input.isTrustedReceipt });
  const unresolved = clusters.length === 0 || judgment.parentMustReview;
  return {
    policy: route.policy, questionType: route.questionType,
    outcome: unresolved ? 'REVIEW_REQUIRED' : 'POLYCENTRIC_JUDGMENT', polycentric: judgment
  };
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
