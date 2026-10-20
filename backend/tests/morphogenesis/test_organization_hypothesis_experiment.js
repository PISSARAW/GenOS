'use strict';

const assert = require('node:assert/strict');
const { compileOrganizationHypothesisExperiment } = require(
  '../../src/services/morphogenesis/organizationHypothesisExperiment');

function rankedInput() {
  return { missionId: 'mission-1', currentTopology: 'a_team', currentVariant: 'default',
    totalTokens: 1000, verifierTokens: 200,
    ranking: { decision: { decision: 'PROPOSE', selectedId: 'topology:trinity' } },
    selected: { candidateId: 'topology:trinity', topology: 'trinity',
      variant: 'counterfactual', interventionScale: 'COHORT_REPLACEMENT' } };
}

function main() {
  const plan = compileOrganizationHypothesisExperiment(rankedInput());
  assert.equal(plan.decision, 'MEASURE');
  assert.equal(plan.executionAuthorized, false);
  assert.equal(plan.promotionAuthority, 'separate_admission_gate');
  assert.deepEqual(plan.arms.map(item => item.budgetTokens), [400, 400]);
  assert.equal(plan.budget.verifierTokens, 200);
  assert.equal(plan.budget.reservationStatus, 'proposed_not_reserved');
  assert.equal(plan.evidencePolicy.independentVerifierRequired, true);
  assert.equal(plan.evidencePolicy.verifierMustDifferFromArmWorkspaces, true);
  assert.match(plan.hypothesis.falsifier, /lower bound.*zero/i);

  const rankingAbstains = compileOrganizationHypothesisExperiment({ ...rankedInput(),
    ranking: { decision: { decision: 'ABSTAIN', selectedId: null } } });
  assert.equal(rankingAbstains.decision, 'NO_CHANGE');
  assert.equal(rankingAbstains.candidate, null);

  const mismatchedCandidate = compileOrganizationHypothesisExperiment({ ...rankedInput(),
    ranking: { decision: { decision: 'PROPOSE', selectedId: 'other' } } });
  assert.equal(mismatchedCandidate.decision, 'NO_CHANGE');

  const insufficientBudget = compileOrganizationHypothesisExperiment({ ...rankedInput(),
    totalTokens: 2, verifierTokens: 1, minimumArmTokens: 1 });
  assert.equal(insufficientBudget.decision, 'NO_CHANGE');
  assert.equal(insufficientBudget.reason, 'insufficient_budget_for_paired_independent_trial');
  assert.equal(insufficientBudget.budget.unallocatedTokens, 2);

  const customMetric = compileOrganizationHypothesisExperiment({ ...rankedInput(),
    primaryMetric: 'verified_resolution_rate' });
  assert.equal(customMetric.evidencePolicy.primaryMetric, 'verified_resolution_rate');
}

main();
