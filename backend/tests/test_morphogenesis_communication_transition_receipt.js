'use strict';

const assert = require('node:assert/strict');
const transition = require('../src/services/morphogenesis/morphogenesisTransitionReceipt');
const intervention = require('../src/services/morphogenesis/communicationReductionIntervention');

function transitionFixture() {
  const worker = { agentId: 'worker-comm', workerKind: 'scout_cell', morphologyTopology: 'a_team',
    morphologyVariant: 'default', missionId: 'mission-comm', toolLease: [...intervention.COORDINATION_TOOLS, 'genos_search'],
    coordinationPolicy: { communicationCadence: 'continuous_sync' } };
  const metricReceipt = { resultId: 'metric-1', evidenceDigest: `sha256:${'a'.repeat(64)}` };
  const adaptation = { communicationIntervention: { candidateId: intervention.CANDIDATE_ID,
      scale: 'COMMUNICATION_REDUCTION', status: 'selected' },
    receipt: { candidateId: intervention.CANDIDATE_ID,
      communicationIntervention: { candidateId: intervention.CANDIDATE_ID, status: 'selected' },
      communicationMetricReceipt: metricReceipt },
    communicationMetric: { receipt: metricReceipt },
    admission: { status: 'admitted', selectionBasis: 'calibrated_communication_policy',
      recipe: { id: intervention.CANDIDATE_ID, scale: 'COMMUNICATION_REDUCTION' } } };
  const input = { state: { workers: new Map([[worker.agentId, worker]]) }, survivors: [worker], adaptation,
    continuation: { workerTokens: [25], perWorkerTokens: 25 } };
  return { worker, adaptation, input };
}

function queuedMission(worker, receipt) {
  const removed = new Set(intervention.COORDINATION_TOOLS);
  return { ...worker, toolLease: worker.toolLease.filter((tool) => !removed.has(tool)),
    coordinationPolicy: { communicationCadence: 'barrier_only' },
    communicationIntervention: { candidateId: intervention.CANDIDATE_ID,
      transitionId: receipt.transitionId, metricId: 'metric-1', metricReceiptId: 'metric-1',
      status: 'applied_at_epoch_boundary' },
    budgetRound: { transitionId: receipt.transitionId },
    executionBudget: { tokens: 25 } };
}

function run() {
  const { worker, input } = transitionFixture();
  const receipt = transition.sealTransitionReceipt(input);
  assert.equal(transition.verifyTransitionReceipt(receipt), true);
  const mission = queuedMission(worker, receipt);
  transition.finalizeTransitionQueue(receipt, [worker.agentId], [mission]);
  assert.equal(receipt.dispatchStatus, 'queued');
  assert.equal(receipt.identity.communicationMetricReceipt.resultId, 'metric-1');
  assert.equal(receipt.identity.communicationEffect.workers[0].toolLease.includes('genos_search'), true);

  const diverged = transitionFixture();
  const badReceipt = transition.sealTransitionReceipt(diverged.input);
  const badMission = queuedMission(diverged.worker, badReceipt);
  badMission.toolLease.push('genos_worker_publish');
  assert.throws(() => transition.finalizeTransitionQueue(badReceipt, [diverged.worker.agentId], [badMission]),
    { code: 'MORPHOGENESIS_TRANSITION_EFFECT_DIVERGED' });
  assert.equal(badReceipt.dispatchStatus, 'diverged');
  console.log('Morphogenesis communication transition binds signed metric, exact effect, transition ID, and budget: PASS');
}

run();
