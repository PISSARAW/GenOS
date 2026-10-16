'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'intervention-paired-corpus-test-key';

const assert = require('node:assert/strict');
const { openDatabase } = require('../helpers/biologyDatabase');
const calibration = require('../../src/services/morphogenesis/morphogenesisSelectorCalibration');
const paired = require('../../src/services/morphogenesis/morphogenesisPairedOutcomeProducer');
const pairEvidence = require('../../src/services/morphogenesis/morphogenesisPairedOutcomeEvidence');
const store = require('../../src/services/morphogenesis/morphogenesisVerifiedOutcomeStore');
const transitions = require('../../src/services/morphogenesis/morphogenesisTransitionReceipt');
const intervention = require('../../src/services/morphogenesis/communicationReductionIntervention');
const receipts = require('../../src/services/epistemicVerifierReceiptService');
const trust = require('../../src/services/verifierTrustRegistry');

const STARTED_AT = '2026-10-15T10:00:00.000Z';
const RECORDED_AT = '2026-10-14T10:00:00.000Z';
const SCOPE = { organizationId: 'org-corpus', projectId: 'proj-corpus' };

function sign(resultId, evidenceDigest, options = {}) {
  return receipts.issueReceipt({ resultId, evidenceDigest,
    verifierDigest: trust.getVerifier('benchmark').digest, independent: true,
    checkedAt: options.checkedAt,
    independenceDescriptor: { actorId: 'independent-oracle',
      workspaceId: options.workspaceId || 'oracle-workspace' } });
}

function signedAttempt(attempt) {
  attempt.oracleReceipt = sign(attempt.id, pairEvidence.sha(pairEvidence.observedAttempt(attempt)));
  return attempt;
}

function signedPrediction(prediction) {
  prediction.receipt = sign(prediction.id,
    pairEvidence.sha(pairEvidence.observedPrediction(prediction)),
    { checkedAt: prediction.recordedAt });
  return prediction;
}

function commTransition(index) {
  const workerId = `comm-worker-${index}`;
  const worker = { agentId: workerId, workerKind: 'scout_cell',
    morphologyTopology: 'a_team', morphologyVariant: 'default',
    missionId: `comm-mission-${index}`,
    toolLease: [...intervention.COORDINATION_TOOLS, 'genos_search'],
    coordinationPolicy: { communicationCadence: 'continuous_sync' } };
  const metricReceipt = { resultId: `comm-metric-${index}`,
    evidenceDigest: `sha256:${'c'.repeat(64)}` };
  const adaptation = { communicationIntervention: { candidateId: intervention.CANDIDATE_ID,
      scale: 'COMMUNICATION_REDUCTION', status: 'selected' },
    receipt: { candidateId: intervention.CANDIDATE_ID,
      communicationIntervention: { candidateId: intervention.CANDIDATE_ID, status: 'selected' },
      communicationMetricReceipt: metricReceipt },
    communicationMetric: { receipt: metricReceipt },
    admission: { status: 'admitted', selectionBasis: 'calibrated_communication_policy',
      recipe: { id: intervention.CANDIDATE_ID, scale: 'COMMUNICATION_REDUCTION' } } };
  const input = { state: { workers: new Map([[workerId, worker]]) },
    survivors: [{ agentId: workerId }], adaptation,
    continuation: { workerTokens: [25], perWorkerTokens: 25 } };
  const receipt = transitions.sealTransitionReceipt(input);
  const mission = { ...worker, toolLease: ['genos_search'],
    coordinationPolicy: { communicationCadence: 'barrier_only' },
    communicationIntervention: { candidateId: intervention.CANDIDATE_ID,
      transitionId: receipt.transitionId, metricId: metricReceipt.resultId,
      metricReceiptId: metricReceipt.resultId, status: 'applied_at_epoch_boundary' },
    budgetRound: { transitionId: receipt.transitionId },
    executionBudget: { tokens: 25 } };
  transitions.finalizeTransitionQueue(receipt, [workerId], [mission]);
  return receipt;
}

function commPair(index) {
  const training = index % 40 < 30;
  const shared = { taskId: `comm-task-${index}`, seed: index,
    taskFamily: training ? 'comm-train-family' : 'comm-holdout-family',
    modelId: training ? 'comm-train-model' : 'comm-holdout-model',
    startedAt: STARTED_AT, budgetTokens: 1000,
    latencyBudgetMs: 1000, toolPolicyHash: 'none', completed: true };
  const transitionReceipt = commTransition(index);
  const candidate = signedAttempt({ ...shared, id: `comm-candidate-${index}`,
    workspaceId: `comm-candidate-ws-${index}`, quality: 0.8,
    tokens: 500, latencyMs: 500, transitionId: transitionReceipt.transitionId,
    workerResults: [] });
  const control = signedAttempt({ ...shared, id: `comm-control-${index}`,
    workspaceId: `comm-control-ws-${index}`, quality: 0.1,
    tokens: 300, latencyMs: 300, transitionId: null, workerResults: [] });
  const prediction = signedPrediction({ id: `comm-prediction-${index}`,
    candidateId: intervention.CANDIDATE_ID, taskId: shared.taskId, seed: index,
    split: training ? 'train' : 'validation', method: 'fixture_prior',
    recordedAt: RECORDED_AT, predictedGain: 0.8, predictedCost: 0.2 });
  return { scale: 'COMMUNICATION_REDUCTION', candidate, control, prediction, transitionReceipt };
}

function commRow(index) {
  const row = paired.buildRow(commPair(index));
  row.receipt = sign(row.id, calibration.digest(row));
  return row;
}

function simpleRows() {
  return Array.from({ length: 5 }, (_, index) => {
    const row = { id: `partial-${index}`, scale: 'COMMUNICATION_REDUCTION',
      candidateId: intervention.CANDIDATE_ID, taskFamily: `train-family-${index}`,
      modelId: `train-model-${index}`, split: 'train',
      predictedGain: 0.8, actualGain: 0.7, predictedCost: 0.1, actualCost: 0.1 };
    row.receipt = sign(row.id, calibration.digest(row),
      { workspaceId: `partial-oracle-${index}` });
    return row;
  });
}

function resourcePlan() {
  const { arbitrateGroupNeeds } = require('../../src/services/morphogenesis/groupResourceNegotiation');
  const describe = require('../../src/services/morphogenesis/resourceReallocationCandidate').describeResourceReallocation;
  const proofDigest = `sha256:${'d'.repeat(64)}`;
  const proof = sign('resource-need-proof', proofDigest, { workspaceId: 'resource-proof' });
  const plan = arbitrateGroupNeeds({ budget: 80, groups: [{ id: 'group-a', state: 'active', needs: [{
    id: 'need-a', requestedTokens: 40, minimumTokens: 20, marginalValue: 0.9, confidence: 0.9,
    evidenceRefs: ['resource-need-proof'], proofDigest, proofReceipts: [proof],
    workerKind: 'scout_cell', workerCount: 0 }] }] });
  plan.candidate = describe(plan);
  return plan;
}

function resourceTransition() {
  const { allocateNegotiatedWorkers } = require('../../src/services/morphogenesis/morphogenesisEpochFunding');
  const plan = resourcePlan();
  const transitionId = 'graph-corpus:2';
  const decision = { resources: plan, challenge: null, policy: { decision: {
    interventionScale: 'RESOURCE_REALLOCATION',
    recipe: { resourceAllocationIntervention: { candidateId: plan.candidate.candidateId } } } } };
  const receipt = { transitionId, resourceAllocationBinding: {
    candidateId: plan.candidate.candidateId, planDigest: plan.candidate.planDigest, transitionId } };
  const adaptation = { adapted: true, decision, receipt,
    admission: { status: 'admitted', executionAuthorized: true,
      selectionBasis: 'calibrated_policy_proposal', comparativeQuality: 'measured',
      recipe: { id: 'topology-candidate', topology: 'biocenose', variant: 'default' } },
    plan: { morphologyPatch: { graph: { graphId: 'graph-corpus', version: 2, nodes: [{ nodeId: 'n1' }] } } } };
  const state = { epochBudget: { minimum: 1 }, workers: new Map([
    ['w1', { groupId: 'group-a', workerKind: 'scout_cell', morphologyTopology: 'biocenose', morphologyVariant: 'default' }],
    ['w2', { groupId: 'group-a', workerKind: 'scout_cell', morphologyTopology: 'biocenose', morphologyVariant: 'default' }]]),
    survivors: [{ agentId: 'w1' }, { agentId: 'w2' }] };
  const funded = allocateNegotiatedWorkers({ adaptation, reservation: { reservedTokens: 80 }, state,
    survivors: state.survivors });
  const sealed = transitions.sealTransitionReceipt({ adaptation, state,
    survivors: funded.survivors, continuation: { workerTokens: funded.workerTokens } });
  transitions.finalizeTransitionQueue(sealed, ['w1', 'w2']);
  return { plan, receipt: sealed };
}

function resourceRow() {
  const { plan, receipt } = resourceTransition();
  const shared = { taskId: 'resource-task-0', seed: 0, taskFamily: 'resource-train-family',
    modelId: 'resource-train-model', startedAt: STARTED_AT, budgetTokens: 1000,
    latencyBudgetMs: 1000, toolPolicyHash: 'none', completed: true };
  const candidate = signedAttempt({ ...shared, id: 'resource-candidate-0',
    workspaceId: 'resource-candidate-ws', quality: 0.8,
    tokens: 500, latencyMs: 500, transitionId: receipt.transitionId, workerResults: [] });
  const control = signedAttempt({ ...shared, id: 'resource-control-0',
    workspaceId: 'resource-control-ws', quality: 0.1,
    tokens: 300, latencyMs: 300, transitionId: null, workerResults: [] });
  const prediction = signedPrediction({ id: 'resource-prediction-0',
    candidateId: plan.candidate.candidateId, taskId: shared.taskId, seed: 0,
    split: 'train', method: 'fixture_prior', recordedAt: RECORDED_AT,
    predictedGain: 0.8, predictedCost: 0.2 });
  const row = paired.buildRow({ scale: 'RESOURCE_REALLOCATION',
    candidate, control, prediction, transitionReceipt: receipt });
  row.receipt = sign(row.id, calibration.digest(row));
  return { row, candidateId: plan.candidate.candidateId };
}

function testDeficitReporting() {
  const empty = calibration.describeCorpusDeficit([]);
  assert.equal(empty.status, 'unavailable');
  assert.equal(empty.verifiedSampleCount, 0);
  assert.equal(empty.requiredTrain, 30);
  assert.equal(empty.requiredValidation, 10);
  const partial = calibration.describeCorpusDeficit(simpleRows());
  const deficit = partial.scales.COMMUNICATION_REDUCTION.candidates[intervention.CANDIDATE_ID];
  assert.equal(deficit.train, 5);
  assert.equal(deficit.validation, 0);
  assert.equal(deficit.needsTrain, 25);
  assert.equal(deficit.needsValidation, 10);
  assert.equal(deficit.status, 'unavailable');
}

function testInterventionProducerValidation() {
  const pair = commPair(0);
  const commBuilt = paired.buildRow(pair);
  assert.equal(commBuilt.scale, 'COMMUNICATION_REDUCTION');
  assert.equal(commBuilt.candidateId, intervention.CANDIDATE_ID);
  assert.equal(pairEvidence.validPairedEvidence(commBuilt), true);
  const { row, candidateId } = resourceRow();
  assert.equal(row.scale, 'RESOURCE_REALLOCATION');
  assert.equal(row.candidateId, candidateId);
  assert.equal(pairEvidence.validPairedEvidence(row), true);
  assert.equal(calibration.verifiedRow(row), true);
  assert.throws(() => paired.buildRow({ ...pair, scale: 'NO_CHANGE' }),
    /scale_not_paired/);
}

async function testPairedCorpusCalibratesAndPersists() {
  const db = openDatabase();
  try {
    const rows = Array.from({ length: 40 }, (_, index) => commRow(index));
    for (let index = 0; index < rows.length; index += 1) {
      const recorded = await paired.recordPairedOutcome(db, {
        scope: { ...SCOPE, missionId: `corpus-source-${index}` },
        pair: rows[index].pairEvidence, receipt: rows[index].receipt });
      assert.equal(recorded.recorded, true);
    }
    const loaded = await store.loadVerifiedOutcomes(db, { ...SCOPE, missionId: 'live-mission' });
    assert.equal(loaded.length, 40);
    const compiled = calibration.compileCalibration(loaded);
    const estimate = compiled.scales.COMMUNICATION_REDUCTION.candidates[intervention.CANDIDATE_ID];
    assert.equal(estimate.status, 'calibrated');
    const deficit = calibration.describeCorpusDeficit(loaded);
    assert.equal(deficit.scales.COMMUNICATION_REDUCTION.candidates[intervention.CANDIDATE_ID].needsTrain, 0);
    assert.equal(deficit.scales.COMMUNICATION_REDUCTION.candidates[intervention.CANDIDATE_ID].needsValidation, 0);
    assert.equal(calibration.selectScale(compiled,
      [{ scale: 'COMMUNICATION_REDUCTION', candidateId: intervention.CANDIDATE_ID }]).scale,
    'COMMUNICATION_REDUCTION');
  } finally {
    await db.close();
  }
}

async function main() {
  testDeficitReporting();
  testInterventionProducerValidation();
  await testPairedCorpusCalibratesAndPersists();
  process.stdout.write('intervention paired corpus tests passed\n');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
