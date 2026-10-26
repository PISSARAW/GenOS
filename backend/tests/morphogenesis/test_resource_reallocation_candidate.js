'use strict';

const assert = require('node:assert/strict');
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'resource-reallocation-test-secret';
const { arbitrateGroupNeeds } = require('../../src/services/morphogenesis/groupResourceNegotiation');
const candidate = require('../../src/services/morphogenesis/resourceReallocationCandidate');
const calibration = require('../../src/services/morphogenesis/morphogenesisSelectorCalibration');
const paired = require('../../src/services/morphogenesis/morphogenesisPairedOutcomeProducer');
const pairEvidence = require('../../src/services/morphogenesis/morphogenesisPairedOutcomeEvidence');
const transitions = require('../../src/services/morphogenesis/morphogenesisTransitionReceipt');
const { allocateNegotiatedWorkers } = require('../../src/services/morphogenesis/morphogenesisEpochFunding');
const receiptService = require('../../src/services/epistemicVerifierReceiptService');
const verifierTrust = require('../../src/services/verifierTrustRegistry');
const resourceNeedReceipt = require('../../src/services/morphogenesis/resourceNeedReceipt');
const { compileConditionalMorphogenesisPolicy } = require('../../src/services/morphogenesis/conditionalMorphogenesisPolicy');

function sign(resultId, evidenceDigest, options = {}) {
  return receiptService.issueReceipt({ resultId, evidenceDigest,
    verifierDigest: verifierTrust.getVerifier('benchmark').digest, independent: true,
    checkedAt: options.checkedAt,
    independenceDescriptor: { actorId: 'independent-oracle',
      workspaceId: options.workspaceId || 'resource-oracle' } });
}

function fundedPlan() {
  const context = { missionId: 'resource-mission', promptDigest: `sha256:${'c'.repeat(64)}` };
  const rawNeed = { id: 'need-a', requestedTokens: 40, minimumTokens: 20,
    marginalValue: 0.9, confidence: 0.9, evidenceRefs: ['resource-need-proof'],
    workerKind: 'scout_cell', workerCount: 0 };
  const binding = { groupId: 'group-a', workerId: 'worker-a', need: rawNeed, context };
  const digest = resourceNeedReceipt.digestFor(binding);
  const need = resourceNeedReceipt.bindNeed({ ...binding, need: { ...rawNeed,
    proofReceipts: [sign('resource-need-proof', digest, { workspaceId: 'resource-proof' })] } });
  return arbitrateGroupNeeds({ budget: 80, groups: [{ id: 'group-a', state: 'active', needs: [{
    ...need
  }] }] });
}

function preparedPlan() {
  const plan = fundedPlan();
  plan.candidate = candidate.describeResourceReallocation(plan);
  return plan;
}

function resourceTransition(plan) {
  const transitionId = 'graph-corpus:2';
  const decision = { resources: plan, challenge: null, policy: { decision: {
    interventionScale: 'RESOURCE_REALLOCATION',
    recipe: { resourceAllocationIntervention: { candidateId: plan.candidate.candidateId } } } } };
  const adaptation = { adapted: true, decision,
    receipt: { transitionId, resourceAllocationBinding: {
      candidateId: plan.candidate.candidateId, planDigest: plan.candidate.planDigest, transitionId } },
    admission: { status: 'admitted', executionAuthorized: true,
      selectionBasis: 'calibrated_policy_proposal', comparativeQuality: 'measured',
      recipe: { id: 'topology-candidate', topology: 'biocenose', variant: 'default' },
      actualPlan: { workerAssignments: [{ workerId: 'w1', workerKind: 'scout_cell',
        topology: 'biocenose', variant: 'default' }, { workerId: 'w2', workerKind: 'scout_cell',
        topology: 'biocenose', variant: 'default' }] } },
    plan: { morphologyPatch: { graph: { graphId: 'graph-corpus', version: 2, nodes: [{ nodeId: 'n1' }] } } } };
  const state = { epochBudget: { minimum: 1 }, workers: new Map([
    ['w1', { agentId: 'w1', groupId: 'group-a', workerKind: 'scout_cell', morphologyTopology: 'biocenose', morphologyVariant: 'default' }],
    ['w2', { agentId: 'w2', groupId: 'group-a', workerKind: 'scout_cell', morphologyTopology: 'biocenose', morphologyVariant: 'default' }]]),
    survivors: [{ agentId: 'w1' }, { agentId: 'w2' }] };
  const funded = allocateNegotiatedWorkers({ adaptation, reservation: { reservedTokens: 80 }, state,
    survivors: state.survivors });
  const sealed = transitions.sealTransitionReceipt({ adaptation, state,
    survivors: funded.survivors, continuation: { workerTokens: funded.workerTokens } });
  assert.deepEqual(sealed.identity.resourceAllocation.verifiedNeedReceipts, [{
    groupId: 'group-a', workerId: 'worker-a', needId: 'need-a',
    resourceNeedDigest: plan.allocations[0].resourceNeedDigest,
    resultId: 'resource-need-proof', evidenceDigest: plan.allocations[0].resourceNeedDigest
  }]);
  transitions.finalizeTransitionQueue(sealed, ['w1', 'w2']);
  return sealed;
}

function outcomeRows(candidateId) {
  return Array.from({ length: 40 }, (_, index) => {
    const plan = preparedPlan();
    const transitionReceipt = resourceTransition(plan);
    const training = index < 30;
    const shared = { taskId: `resource-task-${index}`, seed: index,
      taskFamily: training ? 'train-family' : 'heldout-family',
      modelId: training ? 'train-model' : 'heldout-model', startedAt: '2026-10-15T10:00:00.000Z',
      budgetTokens: 1000, latencyBudgetMs: 1000, toolPolicyHash: 'none', completed: true };
    const candidateAttempt = { ...shared, id: `resource-candidate-${index}`,
      workspaceId: `resource-candidate-ws-${index}`, quality: 0.8, tokens: 500, latencyMs: 500,
      transitionId: transitionReceipt.transitionId, workerResults: [] };
    const controlAttempt = { ...shared, id: `resource-control-${index}`,
      workspaceId: `resource-control-ws-${index}`, quality: 0.1, tokens: 300, latencyMs: 300,
      transitionId: null, workerResults: [] };
    candidateAttempt.oracleReceipt = sign(candidateAttempt.id,
      pairEvidence.sha(pairEvidence.observedAttempt(candidateAttempt)));
    controlAttempt.oracleReceipt = sign(controlAttempt.id,
      pairEvidence.sha(pairEvidence.observedAttempt(controlAttempt)));
    const prediction = { id: `resource-prediction-${index}`, candidateId,
      taskId: shared.taskId, seed: index, split: training ? 'train' : 'validation', method: 'fixture_prior',
      recordedAt: '2026-10-14T10:00:00.000Z', predictedGain: 0.8, predictedCost: 0.2 };
    prediction.receipt = sign(prediction.id, pairEvidence.sha(pairEvidence.observedPrediction(prediction)),
      { checkedAt: prediction.recordedAt });
    const row = paired.buildRow({ scale: 'RESOURCE_REALLOCATION', candidate: candidateAttempt,
      control: controlAttempt, prediction, transitionReceipt });
    row.receipt = sign(row.id, calibration.digest(row), { workspaceId: 'resource-final-oracle' });
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
