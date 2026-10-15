'use strict';

const assert = require('node:assert/strict');
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'resource-reallocation-test-secret';
const { arbitrateGroupNeeds } = require('../../src/services/morphogenesis/groupResourceNegotiation');
const candidate = require('../../src/services/morphogenesis/resourceReallocationCandidate');
const calibration = require('../../src/services/morphogenesis/morphogenesisSelectorCalibration');
const receiptService = require('../../src/services/epistemicVerifierReceiptService');
const verifierTrust = require('../../src/services/verifierTrustRegistry');
const { compileConditionalMorphogenesisPolicy } = require('../../src/services/morphogenesis/conditionalMorphogenesisPolicy');

function proofReceipt() {
  return receiptService.issueReceipt({ resultId: 'resource-need-proof',
    evidenceDigest: `sha256:${'a'.repeat(64)}`,
    verifierDigest: verifierTrust.getVerifier('benchmark').digest, independent: true,
    independenceDescriptor: { actorId: 'resource-auditor', workspaceId: 'resource-proof' } });
}

function fundedPlan() {
  return arbitrateGroupNeeds({ budget: 80, groups: [{ id: 'group-a', state: 'active', needs: [{
    id: 'need-a', requestedTokens: 40, minimumTokens: 20, marginalValue: 0.9, confidence: 0.9,
    evidenceRefs: ['resource-need-proof'], proofDigest: `sha256:${'a'.repeat(64)}`,
    proofReceipts: [proofReceipt()], workerKind: 'scout_cell', workerCount: 0
  }] }] });
}

function outcomeRows(candidateId) {
  return Array.from({ length: 40 }, (_, index) => {
    const row = { id: `resource-outcome-${index}`, candidateId, scale: 'RESOURCE_REALLOCATION',
      taskFamily: index < 30 ? 'train-family' : 'heldout-family',
      modelId: index < 30 ? 'train-model' : 'heldout-model',
      split: index < 30 ? 'train' : 'validation', predictedGain: 0.8, actualGain: 0.7,
      predictedCost: 0.1, actualCost: 0.1 };
    row.receipt = receiptService.issueReceipt({ resultId: row.id,
      evidenceDigest: calibration.digest(row), verifierDigest: verifierTrust.getVerifier('benchmark').digest,
      independent: true, independenceDescriptor: { actorId: 'independent-oracle', workspaceId: 'resource-campaign' } });
    return row;
  });
}

function testOnlyExactFundedPlanWithIndependentProofIsAvailable() {
  const plan = fundedPlan();
  const described = candidate.describeResourceReallocation(plan);
  assert.equal(described.status, 'available');
  assert.match(described.candidateId, /^resource-reallocation:sha256:[a-f0-9]{64}$/);
  assert.deepEqual(candidate.describeResourceReallocation(structuredClone(plan)), described);
  plan.allocations[0].proofReceipts = [];
  assert.equal(candidate.describeResourceReallocation(plan).status, 'unavailable');
}

function testExactOutcomeCalibratesAndMissingOutcomeAbstains() {
  const plan = fundedPlan();
  const descriptor = candidate.describeResourceReallocation(plan);
  const abstaining = compileConditionalMorphogenesisPolicy({ mission: 'Allocate resources',
    currentTopology: 'a_team', resourceAllocationPlan: plan, diagnosis: {} });
  assert.equal(abstaining.decision.interventionScale, 'NO_CHANGE');
  assert.equal(abstaining.portfolio.interventionScales.RESOURCE_REALLOCATION.status, 'calibration_required');

  const adapted = compileConditionalMorphogenesisPolicy({ mission: 'Allocate resources',
    currentTopology: 'a_team', resourceAllocationPlan: plan, verifiedOutcomes: outcomeRows(descriptor.candidateId),
    diagnosis: {} });
  assert.equal(adapted.decision.interventionScale, 'RESOURCE_REALLOCATION');
  assert.equal(adapted.decision.recipe.resourceAllocationIntervention.candidateId, descriptor.candidateId);
  assert.equal(adapted.decision.recipe.resourceAllocationIntervention.planDigest, descriptor.planDigest);
}

testOnlyExactFundedPlanWithIndependentProofIsAvailable();
testExactOutcomeCalibratesAndMissingOutcomeAbstains();
process.stdout.write('resource reallocation candidate tests passed\n');
