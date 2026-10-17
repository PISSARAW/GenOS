'use strict';

const assert = require('node:assert/strict');
const roster = require('../src/services/morphogenesis/rosterReductionIntervention');
const recruitment = require('../src/services/morphogenesis/morphogenesisEpochRecruitment');
const transitions = require('../src/services/morphogenesis/morphogenesisTransitionReceipt');
const queue = require('../src/services/agentContinuationQueueService');
const durable = require('../src/services/durableContinuationService');
const { pendingContinuations } = require('../src/services/agentOrchestrationState');
const { compileConditionalMorphogenesisPolicy } = require('../src/services/morphogenesis/conditionalMorphogenesisPolicy');

function fixture() {
  const workers = ['worker-a', 'worker-b', 'worker-c'].map((agentId, index) => ({
    agentId, workerKind: index ? 'reviewer_cell' : 'researcher_cell',
    role: index ? 'reviewer' : 'researcher', executionBudget: { tokens: 100 },
    toolLease: ['genos_search'], prompt: 'Continue.' }));
  const plan = { currentWorkerIds: workers.map((worker) => worker.agentId),
    retainedWorkerIds: ['worker-a', 'worker-b'], requiredRoles: ['researcher', 'reviewer'], workers };
  return { workers, plan };
}

function verifyAvailabilityAndPortfolio() {
  const { plan } = fixture();
  const available = roster.describeAvailability(plan);
  assert.equal(available.status, 'available');
  assert.deepEqual(available.removedWorkerIds, ['worker-c']);
  const policy = compileConditionalMorphogenesisPolicy({ mission: 'Reduce a redundant roster',
    currentTopology: 'a_team', rosterReductionPlan: plan });
  assert.equal(policy.portfolio.rosterReduction.status, 'available');
  assert.equal(policy.portfolio.interventionScales.ROSTER_REDUCTION.status,
    'calibration_required');
  assert.equal(policy.decision.interventionScale, 'NO_CHANGE');
}

function verifyCandidateFiltering() {
  const { plan } = fixture();
  const survivors = plan.currentWorkerIds.map((agentId) => ({ agentId }));
  const selected = recruitment.candidateWorkers({ rosterIntervention: {
    candidateId: roster.CANDIDATE_ID }, rosterPlan: plan }, survivors, 3);
  assert.deepEqual(selected.map((item) => item.agentId), plan.retainedWorkerIds);
}

async function verifySealedRuntimeEffect() {
  const { workers, plan } = fixture();
  const state = { db: {}, normalizedMission: { missionId: 'roster-runtime' },
    workers: new Map(workers.map((worker) => [worker.agentId, worker])) };
  const adaptation = { rosterIntervention: { candidateId: roster.CANDIDATE_ID,
      scale: 'ROSTER_REDUCTION', status: 'selected' }, rosterPlan: plan,
    receipt: { candidateId: roster.CANDIDATE_ID },
    admission: { status: 'admitted', executionAuthorized: true,
      selectionBasis: 'calibrated_roster_policy', recipe: {
        id: roster.CANDIDATE_ID, scale: 'ROSTER_REDUCTION' } } };
  const survivors = plan.retainedWorkerIds.map((agentId) => ({ agentId, payload: {} }));
  const receipt = transitions.sealTransitionReceipt({ state, survivors,
    continuation: { workerTokens: [40, 40] }, adaptation });
  const originalPersist = durable.persistContinuations;
  durable.persistContinuations = async () => {};
  try {
    const queued = await queue.queueContinuationMissions(survivors.map((survivor, index) => ({
      state, survivor, continuation: { workerTokens: [40, 40] }, index,
      orchestratorId: 'roster-runtime', adaptation, epoch: 1 })));
    const missions = queued.map((workerId) => pendingContinuations.get(workerId));
    transitions.finalizeTransitionQueue(receipt, queued, missions);
    assert.equal(receipt.dispatchStatus, 'queued');
    assert.deepEqual(receipt.identity.rosterEffect.removedWorkerIds, ['worker-c']);
    assert.ok(missions.every((mission) =>
      mission.rosterIntervention.status === 'retained_at_epoch_boundary'));
    const removed = roster.applyRosterReduction(workers[2], {
      ...adaptation.rosterIntervention, transitionId: receipt.transitionId }, plan);
    assert.equal(removed.reason, 'worker_not_retained');
  } finally {
    durable.persistContinuations = originalPersist;
    plan.retainedWorkerIds.forEach((workerId) => pendingContinuations.delete(workerId));
  }
}

async function main() {
  verifyAvailabilityAndPortfolio();
  verifyCandidateFiltering();
  await verifySealedRuntimeEffect();
  console.log('Morphogenesis roster reduction is calibrated, sealed and applied at the epoch boundary: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
