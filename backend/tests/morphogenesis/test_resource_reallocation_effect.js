'use strict';

const assert = require('node:assert/strict');
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'resource-effect-test-secret';
const { allocateNegotiatedWorkers } = require('../../src/services/morphogenesis/morphogenesisEpochFunding');
const { arbitrateGroupNeeds } = require('../../src/services/morphogenesis/groupResourceNegotiation');
const descriptorFor = require('../../src/services/morphogenesis/resourceReallocationCandidate').describeResourceReallocation;
const transitionReceipt = require('../../src/services/morphogenesis/morphogenesisTransitionReceipt');
const receiptService = require('../../src/services/epistemicVerifierReceiptService');
const verifierTrust = require('../../src/services/verifierTrustRegistry');

function resources() {
  const proofDigest = `sha256:${'b'.repeat(64)}`;
  const proof = receiptService.issueReceipt({ resultId: 'need-proof', evidenceDigest: proofDigest,
    verifierDigest: verifierTrust.getVerifier('benchmark').digest, independent: true,
    independenceDescriptor: { actorId: 'independent-resource-auditor', workspaceId: 'test' } });
  const plan = arbitrateGroupNeeds({ budget: 80, groups: [{ id: 'group-a', state: 'active', needs: [{
    id: 'need-a', requestedTokens: 40, minimumTokens: 20, marginalValue: 0.9, confidence: 0.9,
    evidenceRefs: ['need-proof'], proofDigest, proofReceipts: [proof], workerKind: 'scout_cell', workerCount: 0
  }] }] });
  plan.candidate = descriptorFor(plan);
  return plan;
}

function allocationInput(plan, selected) {
  const transitionId = 'graph-1:2';
  const decision = { resources: plan, challenge: null, policy: { decision: {
    interventionScale: selected ? 'RESOURCE_REALLOCATION' : 'NO_CHANGE',
    recipe: selected ? { resourceAllocationIntervention: { candidateId: plan.candidate.candidateId } } : {}
  } } };
  const receipt = { transitionId, resourceAllocationBinding: {
    candidateId: plan.candidate.candidateId, planDigest: plan.candidate.planDigest, transitionId
  } };
  const adaptation = { adapted: true, decision, receipt,
    admission: { status: 'admitted', executionAuthorized: true,
      selectionBasis: 'calibrated_policy_proposal', comparativeQuality: 'measured',
      recipe: { id: 'topology-candidate', topology: 'biocenose', variant: 'default' } },
    plan: { morphologyPatch: { graph: { graphId: 'graph-1', version: 2, nodes: [{ nodeId: 'n1' }] } } } };
  return { adaptation,
  reservation: { reservedTokens: 80 }, state: { epochBudget: { minimum: 1 }, workers: new Map([
    ['w1', { groupId: 'group-a', workerKind: 'scout_cell', morphologyTopology: 'biocenose', morphologyVariant: 'default' }],
    ['w2', { groupId: 'group-a', workerKind: 'scout_cell', morphologyTopology: 'biocenose', morphologyVariant: 'default' }]
  ]) }, survivors: [{ agentId: 'w1' }, { agentId: 'w2' }] };
}

function testNoChangeDoesNotApplyTheNegotiatedPlan() {
  const input = allocationInput(resources(), false);
  const funded = allocateNegotiatedWorkers(input);
  assert.deepEqual(funded.workerTokens, [40, 40]);
  assert.equal(input.adaptation.receipt.resourceAllocationEffect.status, 'not_applied');
  assert.equal(input.adaptation.receipt.resourceAllocationEffect.reason, 'not_selected_or_not_admitted');
}

function testExactAdmittedCandidateAppliesAndBindsFunding() {
  const plan = resources();
  const input = allocationInput(plan, true);
  const funded = allocateNegotiatedWorkers(input);
  assert.deepEqual(funded.workerTokens, [20, 20]);
  assert.equal(input.adaptation.receipt.resourceAllocationEffect.status, 'applied');
  assert.equal(input.adaptation.receipt.resourceAllocationEffect.candidateId, plan.candidate.candidateId);
  assert.equal(input.adaptation.receipt.resourceAllocationEffect.transitionId, 'graph-1:2');
  const receipt = transitionReceipt.sealTransitionReceipt({ adaptation: input.adaptation,
    state: input.state, survivors: funded.survivors,
    continuation: { workerTokens: funded.workerTokens } });
  assert.equal(receipt.resourceAllocationBinding.transitionId, receipt.transitionId);
  assert.equal(receipt.resourceAllocationEffect.transitionId, receipt.transitionId);
  assert.equal(transitionReceipt.verifyTransitionReceipt(receipt), true,
    'the sealed transition includes the exact resource candidate, admission and funded workers');
  const changedTokens = structuredClone(receipt);
  changedTokens.resourceAllocationEffect.workerTokenAllocations[0].tokens += 1;
  assert.equal(transitionReceipt.verifyTransitionReceipt(changedTokens), false,
    'changing a funded worker after sealing invalidates the transition receipt');
  const changedAdmission = structuredClone(receipt);
  changedAdmission.strategyAdmission.recipe.id = 'other-candidate';
  assert.equal(transitionReceipt.verifyTransitionReceipt(changedAdmission), false,
    'changing the admitted strategy after sealing invalidates the transition receipt');
  const changedCandidate = structuredClone(receipt);
  changedCandidate.resourceAllocationBinding.planDigest = `sha256:${'f'.repeat(64)}`;
  assert.equal(transitionReceipt.verifyTransitionReceipt(changedCandidate), false,
    'changing the resource candidate after sealing invalidates the transition receipt');
}

testNoChangeDoesNotApplyTheNegotiatedPlan();
testExactAdmittedCandidateAppliesAndBindsFunding();
process.stdout.write('resource reallocation effect tests passed\n');
