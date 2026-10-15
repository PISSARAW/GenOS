'use strict';

const assert = require('node:assert/strict');
const {
  compileConditionalMorphogenesisPolicy,
  reevaluateConditionalMorphogenesisPolicy
} = require('../../src/services/morphogenesis/conditionalMorphogenesisPolicy');

function testCompilesPolicyFromObservedNeeds() {
  const policy = compileConditionalMorphogenesisPolicy({
    mission: 'Resolve a disputed incident', currentTopology: 'a_team',
    budget: { tokens: 10000 }, maxEpochs: 4,
    diagnosis: { provenanceRisk: 0.9, uncertainty: 0.2, adversarialRisk: 0.8 },
    availableTopologyCapabilities: [], availableCapabilities: ['observe', 'verify'],
    availableWorkerKinds: ['scout_cell', 'verifier_worker'],
    workerAssignments: ['scout_cell', 'verifier_worker'],
    operationalConstraints: { daemonAllowed: false }
  });
  assert.equal(policy.status, 'proposed');
  assert.equal(policy.decision.representation, 'provenance_graph');
  assert.ok(policy.decision.proofObligations.some(item => item.id === 'source_independence'));
  assert.ok(policy.decision.proofObligations.some(item => item.id === 'counterexample_search'));
  assert.equal(policy.decision.budget.totalTokens, 10000);
  assert.equal(policy.decision.budget.maxEpochs, 4);
  assert.equal(policy.bounds.executionAuthorized, false);
  assert.ok(policy.portfolio.ranking.candidates.some(item => item.isNoChange));
  assert.ok(policy.conditions.some(item => item.action === 'quarantine_correlated_claims'));
}

function testEvidenceChangeRecompilesAndVerifiedReceiptStops() {
  const context = { mission: 'Investigate failure', currentTopology: 'a_team',
    budget: { tokens: 5000 }, diagnosis: { causalAmbiguity: 0.8 } };
  const initial = compileConditionalMorphogenesisPolicy(context);
  const changed = reevaluateConditionalMorphogenesisPolicy({ policy: initial, context,
    observation: { uncertainty: 0.9 }, remainingBudget: { tokens: 2000 },
    currentTopology: 'a_team', currentVariant: 'default' });
  assert.equal(changed.status, 'continue');
  assert.equal(changed.changed, true);
  assert.equal(changed.policy.decision.representation, 'hypothesis_set');
  assert.equal(changed.policy.decision.budget.totalTokens, 2000);

  const stopped = reevaluateConditionalMorphogenesisPolicy({ policy: changed.policy, context,
    observation: { uncertainty: 0.9 }, receipt: { verified: true, scope: 'mission-1' }, scope: 'mission-1' });
  assert.equal(stopped.status, 'stopped');
  assert.equal(stopped.reason, 'verified_resolution');
  const mismatched = reevaluateConditionalMorphogenesisPolicy({ policy: changed.policy, context,
    observation: {}, receipt: { verified: true, scope: 'other' }, scope: 'mission-1' });
  assert.equal(mismatched.status, 'continue');
}

function testPortfolioContainsVariantsAndNoAuthority() {
  const policy = compileConditionalMorphogenesisPolicy({ mission: 'Compare viable forms',
    currentTopology: 'a_team', budget: { tokens: 5000 }, diagnosis: {},
    availableTopologyCapabilities: null });
  assert.ok(policy.portfolio.generation.candidateCount > 1);
  assert.ok(policy.portfolio.ranking.candidates.some(item => item.variant));
  assert.equal(policy.portfolio.ranking.executionAuthorized, false);
  assert.equal(policy.decision.recipe.executionEligible, false);
}

function main() {
  testCompilesPolicyFromObservedNeeds();
  testEvidenceChangeRecompilesAndVerifiedReceiptStops();
  testPortfolioContainsVariantsAndNoAuthority();
  process.stdout.write('conditional morphogenesis policy tests passed\n');
}

main();
