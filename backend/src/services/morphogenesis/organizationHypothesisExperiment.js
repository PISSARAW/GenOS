'use strict';

const DEFAULT_METRIC = 'verified_mission_utility';

function whole(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function candidateIdentity(selected = {}) {
  return { candidateId: selected.candidateId || selected.id || null,
    topology: selected.topology || null, variant: selected.variant || null,
    interventionScale: selected.interventionScale || null };
}

function baselineIdentity(input) {
  return { candidateId: 'NO_CHANGE', topology: input.currentTopology || null,
    variant: input.currentVariant || null, interventionScale: 'NO_CHANGE' };
}

function selectedByRanking(input, candidate) {
  const decision = input.ranking?.decision;
  return decision?.decision === 'PROPOSE' && decision.selectedId === candidate.candidateId;
}

function candidateAvailable(input, candidate) {
  return candidate.candidateId && candidate.candidateId !== 'NO_CHANGE'
    && selectedByRanking(input, candidate);
}

function experimentBudget(input) {
  const totalTokens = whole(input.totalTokens);
  const minimumArmTokens = Math.max(1, whole(input.minimumArmTokens || 1));
  const requestedVerifier = whole(input.verifierTokens);
  const verifierTokens = Math.max(1, requestedVerifier || Math.floor(totalTokens * 0.2));
  const armTokens = Math.floor((totalTokens - verifierTokens) / 2);
  const valid = armTokens >= minimumArmTokens && verifierTokens < totalTokens;
  return { totalTokens, controlTokens: valid ? armTokens : 0,
    candidateTokens: valid ? armTokens : 0, verifierTokens: valid ? verifierTokens : 0,
    unallocatedTokens: valid ? totalTokens - (2 * armTokens) - verifierTokens : totalTokens,
    minimumArmTokens, valid, reservationStatus: 'proposed_not_reserved' };
}

function noChange(input, reason, budget) {
  return { schemaVersion: 1, kind: 'organization_hypothesis_experiment',
    missionId: input.missionId || null, decision: 'NO_CHANGE', reason,
    baseline: baselineIdentity(input), candidate: null, budget,
    executionAuthorized: false };
}

function arm(id, organization, tokens) {
  return { id, organization, budgetTokens: tokens,
    workspaceIsolationRequired: true, resultAuthority: 'diagnostic_only' };
}

function hypothesis(candidate, metric) {
  return {
    statement: `${candidate.candidateId} must improve ${metric} over NO_CHANGE after marginal cost`,
    nullHypothesis: `${candidate.candidateId} has no positive conservative net value over NO_CHANGE`,
    falsifier: 'paired independent evidence has a net-value lower bound less than or equal to zero'
  };
}

function evidencePolicy(metric) {
  return { primaryMetric: metric, costMetric: 'actual_total_cost',
    comparison: 'paired_same_task_environment', workerReports: 'diagnostic_only',
    independentVerifierRequired: true, verifierMustDifferFromArmWorkspaces: true,
    transitionIdentityRequired: true,
    requiredEvidence: ['morphogenesis_paired_outcome', 'external_pair_receipt'] };
}

function compileOrganizationHypothesisExperiment(input = {}) {
  const candidate = candidateIdentity(input.selected);
  const budget = experimentBudget(input);
  if (!candidateAvailable(input, candidate)) {
    return noChange(input, 'no_ranked_candidate_authorizes_an_experiment', budget);
  }
  if (!budget.valid) return noChange(input, 'insufficient_budget_for_paired_independent_trial', budget);
  const baseline = baselineIdentity(input);
  const metric = typeof input.primaryMetric === 'string' && input.primaryMetric.trim()
    ? input.primaryMetric.trim() : DEFAULT_METRIC;
  return { schemaVersion: 1, kind: 'organization_hypothesis_experiment',
    missionId: input.missionId || null, decision: 'MEASURE', reason: 'ranked_candidate_requires_paired_trial',
    baseline, candidate, hypothesis: hypothesis(candidate, metric),
    arms: [arm('control', baseline, budget.controlTokens),
      arm('candidate', candidate, budget.candidateTokens)],
    budget, evidencePolicy: evidencePolicy(metric),
    acceptanceRule: 'verified_gain_lower_bound > marginal_cost_upper_bound',
    promotionAuthority: 'separate_admission_gate', executionAuthorized: false };
}

module.exports = { compileOrganizationHypothesisExperiment, experimentBudget };
