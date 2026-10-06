'use strict';

const CHECKS = Object.freeze({
  EVIDENCE_SUPPORTED: (item) => item.verifiedClaimIds?.length > 0,
  EVIDENCE_WITH_DISSENT: (item) => item.verifiedClaimIds?.length > 0,
  PROBABILITY_ESTIMATE: (item) => item.estimates?.length > 0,
  PARETO_FRONT: (item) => item.options?.length > 0,
  DESIGN_OPTIONS_REVIEW: (item) => item.options?.length > 0,
  PLURALISM_PRESERVED: (item) => item.perspectives?.length > 0,
  REPRESENTATIVE_DISTRIBUTION: (item) => item.representative?.panelCount > 0
    && item.representative?.distribution?.length > 0,
  CLAIM_MAP: (item) => item.claims?.length > 0 && !item.openQuestions?.length,
  ARGUMENTS_ACCEPTED: (item) => item.argumentation?.labels?.length > 0,
  POLYCENTRIC_JUDGMENT: polycentricReady,
  TYPE_SPECIFIC_RESULTS: mixedReady
});

function ready(aggregation = {}) {
  if (aggregation.unresolvedClaimIds?.length) return false;
  return Boolean(CHECKS[aggregation.outcome]?.(aggregation));
}

function mixedReady(item) {
  return item.results?.length > 0 && item.results.every((entry) => ready(entry.result));
}

function polycentricReady(item) {
  const council = item.polycentric;
  if (!council?.clusters?.length || council.parentMustReview) return false;
  return council.clusters.every((cluster) => !['ABSTAIN', 'UNRESOLVED'].includes(cluster.outcome))
    && council.federation?.parentMustReview !== true;
}

function needsHuman(aggregation = {}) {
  return aggregation.humanJudgmentRequired === true
    || (aggregation.results || []).some((entry) => needsHuman(entry.result));
}

function decisionOutcome(input) {
  const { aggregation, status, dissentIds = [] } = input;
  if (needsHuman(aggregation)) return 'HUMAN_JUDGMENT_REQUIRED';
  if (status === 'ESCALATED' && aggregation.experimentRequired) return 'ESCALATE_EXPERIMENT';
  if (!ready(aggregation)) return input.stopReason === 'ROUND_LIMIT' ? 'IRREDUCIBLE_DISAGREEMENT' : 'REQUEST_MORE_EVIDENCE';
  if (aggregation.outcome === 'PARETO_FRONT') return 'PARETO_PLURALISM';
  if (dissentIds.length) return 'PLURALITY_WITH_DISSENT';
  return consensusOutcome(input);
}

function consensusOutcome(input) {
  if (input.promotionGate?.status === 'ALLOWED' && input.aggregation.questionType === 'FACTUAL') return 'VERIFIED_CONSENSUS';
  if (input.independence?.measured && input.independence.effectiveSize >= 2 && input.aggregation.quorum?.reached) return 'ROBUST_CONSENSUS';
  return 'QUALIFIED_CONSENSUS';
}

module.exports = { ready, needsHuman, decisionOutcome };
