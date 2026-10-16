'use strict';

const assert = require('node:assert/strict');
const {
  compileConditionalMorphogenesisPolicy,
  reevaluateConditionalMorphogenesisPolicy
} = require('../../src/services/morphogenesis/conditionalMorphogenesisPolicy');
const calibration = require('../../src/services/morphogenesis/morphogenesisSelectorCalibration');
const receiptService = require('../../src/services/epistemicVerifierReceiptService');
const verifierTrust = require('../../src/services/verifierTrustRegistry');

function verifiedOutcomes() {
  return Array.from({ length: 40 }, (_, index) => {
    const row = { id: `morphogenesis-outcome-${index}`, candidateId: 'cohort:a_team:stable',
      scale: 'COHORT_REPLACEMENT',
      taskFamily: index < 30 ? 'train-family' : 'heldout-family',
      modelId: index < 30 ? 'train-model' : 'heldout-model',
      split: index < 30 ? 'train' : 'validation', predictedGain: 0.8, actualGain: 0.7,
      predictedCost: 0.1, actualCost: 0.1 };
    row.receipt = receiptService.issueReceipt({ resultId: row.id,
      evidenceDigest: calibration.digest(row), verifierDigest: verifierTrust.getVerifier('benchmark').digest,
      independent: true, independenceDescriptor: { actorId: 'independent-oracle', workspaceId: 'heldout-campaign' } });
    return row;
  });
}

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

function testCalibrationRequiresVerifiedCrossDomainHoldoutAndFavorsAbstention() {
  const empty = compileConditionalMorphogenesisPolicy({ mission: 'Abstain without evidence', currentTopology: 'a_team' });
  assert.equal(empty.decision.interventionScale, 'NO_CHANGE');
  assert.equal(empty.portfolio.calibration.status, 'unavailable');
  assert.equal(empty.portfolio.interventionScales.COMMUNICATION_REDUCTION.status, 'unavailable');
  assert.equal(empty.portfolio.interventionScales.RESOURCE_REALLOCATION.status, 'unavailable');

  const samples = verifiedOutcomes();
  const fitted = calibration.compileCalibration(samples);
  assert.equal(fitted.verifiedSampleCount, 0);
  assert.equal(fitted.status, 'unavailable');
  assert.equal(fitted.scales.COHORT_REPLACEMENT.status, 'unavailable');
  assert.equal(calibration.selectScale(fitted, [{ scale: 'COHORT_REPLACEMENT',
    candidateId: 'cohort:a_team:stable' }]).scale, 'NO_CHANGE');

  samples[39].actualGain = 0.7;
  samples[39].receipt = { ...samples[39].receipt, evidenceDigest: 'sha256:' + '0'.repeat(64) };
  assert.equal(calibration.compileCalibration(samples).verifiedSampleCount, 0);
}

function testEpochBoundIsEnforced() {
  const capped = compileConditionalMorphogenesisPolicy({
    mission: 'Bounded epochs', currentTopology: 'a_team',
    budget: { tokens: 10000 }, maxEpochs: 100, diagnosis: {}
  });
  assert.equal(capped.decision.budget.maxEpochs, 12);
  assert.equal(capped.bounds.maxEpochs, 12);
  const infinite = compileConditionalMorphogenesisPolicy({
    mission: 'Bounded epochs', currentTopology: 'a_team',
    budget: { tokens: 10000 }, maxEpochs: Infinity, diagnosis: {}
  });
  assert.equal(infinite.decision.budget.maxEpochs, 12);
  assert.ok(capped.decision.budget.stopWhen.includes('policy_epoch_limit'));
}

function main() {
  const previousId = process.env.GENOS_EPISTEMIC_RECEIPT_KEY_ID;
  const previousSecret = process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
  process.env.GENOS_EPISTEMIC_RECEIPT_KEY_ID = 'legacy';
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'test-only-conditional-morphogenesis-secret';
  try {
    testCompilesPolicyFromObservedNeeds();
    testEvidenceChangeRecompilesAndVerifiedReceiptStops();
    testEpochBoundIsEnforced();
    testPortfolioContainsVariantsAndNoAuthority();
    testCalibrationRequiresVerifiedCrossDomainHoldoutAndFavorsAbstention();
    process.stdout.write('conditional morphogenesis policy tests passed\n');
  } finally {
    restoreEnvironment('GENOS_EPISTEMIC_RECEIPT_KEY_ID', previousId);
    restoreEnvironment('GENOS_EPISTEMIC_RECEIPT_SECRET', previousSecret);
  }
}

function restoreEnvironment(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

main();
