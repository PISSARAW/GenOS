'use strict';

const PERMISSION = 'world-model:foresight';

function noChange(reason, details = {}) {
  return { decision: 'NO_CHANGE', reason, selectedCandidateId: null,
    evidenceClass: 'counterfactual', mayCountAsRealEffect: false, ...details };
}

function hasBudget(budget, candidate) {
  return Number(budget?.remainingTokens) >= Number(candidate.costTokens)
    && Number(budget?.remainingMs) >= Number(candidate.estimatedMs);
}

function validCandidate(candidate) {
  return candidate && typeof candidate.candidateId === 'string'
    && Number.isFinite(candidate.calibratedConfidence)
    && Number.isFinite(candidate.expectedInformationGain)
    && Number.isFinite(candidate.predictedDecisionImpact)
    && Number.isFinite(candidate.costTokens) && candidate.costTokens >= 0
    && Number.isFinite(candidate.estimatedMs) && candidate.estimatedMs >= 0;
}

function utility(candidate) {
  const value = candidate.calibratedConfidence * candidate.expectedInformationGain
    * candidate.predictedDecisionImpact;
  const cost = 1 + Math.log1p(candidate.costTokens) + Math.log1p(candidate.estimatedMs);
  return value / cost;
}

function meetsThresholds(candidate, policy) {
  return candidate.calibratedConfidence >= policy.minConfidence
    && candidate.expectedInformationGain >= policy.minInformationGain
    && candidate.predictedDecisionImpact >= policy.minDecisionImpact;
}

function rankedCandidates(candidates, policy) {
  return candidates.filter((candidate) => meetsThresholds(candidate, policy))
    .map((candidate) => ({ ...candidate, utility: utility(candidate) }))
    .filter((candidate) => candidate.utility >= policy.minUtility)
    .sort((left, right) => right.utility - left.utility || left.candidateId.localeCompare(right.candidateId));
}

function decide(input) {
  if (!new Set(input?.permissions || []).has(PERMISSION)) return noChange('permission_missing');
  const policy = { minConfidence: 0.55, minInformationGain: 0.15, minDecisionImpact: 0.1,
    minUtility: 0.001, ...(input.policy || {}) };
  const candidates = (input.candidates || []).filter(validCandidate);
  const affordable = candidates.filter((candidate) => hasBudget(input.budget, candidate));
  if (!affordable.length) return noChange(candidates.length ? 'budget_insufficient' : 'no_candidate');
  const eligible = rankedCandidates(affordable, policy);
  if (!eligible.length) return noChange('insufficient_expected_value', { evaluatedCandidates: affordable.length });
  const selected = eligible[0];
  return { decision: 'RUN_FORESIGHT', reason: 'bounded_information_value',
    selectedCandidateId: selected.candidateId, utility: selected.utility,
    reservedBudget: { tokens: selected.costTokens, milliseconds: selected.estimatedMs },
    projectId: input.projectId, trajectoryId: input.trajectoryId,
    responsibleAgentId: input.responsibleAgentId,
    evidenceClass: 'counterfactual', mayCountAsRealEffect: false };
}

module.exports = { PERMISSION, decide, noChange, hasBudget, validCandidate, utility,
  meetsThresholds, rankedCandidates };
