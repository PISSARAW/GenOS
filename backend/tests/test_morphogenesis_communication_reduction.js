'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'morphogenesis-communication-test-secret';
const assert = require('node:assert/strict');
const trusted = require('../src/services/verifierTrustRegistry');
const receipts = require('../src/services/epistemicVerifierReceiptService');
const intervention = require('../src/services/morphogenesis/communicationReductionIntervention');
const calibration = require('../src/services/morphogenesis/morphogenesisSelectorCalibration');
const { compileConditionalMorphogenesisPolicy } = require('../src/services/morphogenesis/conditionalMorphogenesisPolicy');
const continuationPlanner = require('../src/services/morphogenesis/missionMorphogenesisContinuation');
const queue = require('../src/services/agentContinuationQueueService');
const durable = require('../src/services/durableContinuationService');
const { pendingContinuations } = require('../src/services/agentOrchestrationState');
const preflight = require('../bin/worker-mcp-inventory-preflight.cjs');

function metricFor(missionId) {
  const metric = { id: `comm-${missionId}`, missionId, source: 'communication_outcomes', attempts: 20, redundant: 8 };
  metric.receipt = receipts.issueReceipt({ resultId: metric.id, status: 'verified', independent: true,
    evidenceDigest: intervention.metricDigest(metric), verifierDigest: trusted.getVerifier('testResult').digest,
    independenceDescriptor: { actorId: 'independent-communication-verifier', workspaceId: 'isolated-telemetry' } });
  return metric;
}

function eligibleMission(missionId) {
  return { agentId: `worker-${missionId}`, missionId, organization: 'research',
    coordinationPolicy: { communicationCadence: 'continuous_sync' },
    toolLease: [...intervention.COORDINATION_TOOLS, 'genos_search'], requiredTools: ['genos_search'],
    executionBudget: { tokens: 100 }, prompt: 'Continue the task.' };
}

function verifiedCalibrationRows() {
  return Array.from({ length: 40 }, (_, index) => {
    const row = { id: `sample-${index}`, scale: 'COMMUNICATION_REDUCTION',
      taskFamily: index < 30 ? `train-family-${index}` : `holdout-family-${index}`,
      modelId: index < 30 ? `train-model-${index}` : `holdout-model-${index}`,
      split: index < 30 ? 'train' : 'validation', candidateId: intervention.CANDIDATE_ID,
      predictedGain: 0.9, actualGain: 0.9, predictedCost: 0.05, actualCost: 0.05 };
    row.receipt = receipts.issueReceipt({ resultId: row.id, status: 'verified', independent: true,
      evidenceDigest: calibration.digest(row), verifierDigest: trusted.getVerifier('testResult').digest,
      independenceDescriptor: { actorId: `oracle-${index}`, workspaceId: `isolated-${index}` } });
    return row;
  });
}

async function verifySelectorCalibrationAndOptionalLoader() {
  const id = 'communication-policy-selection';
  const mission = eligibleMission(id);
  const metric = metricFor(id);
  const outcomes = verifiedCalibrationRows();
  const policy = compileConditionalMorphogenesisPolicy({ mission: 'Continue safely', missionId: id,
    communicationMission: mission, communicationMetric: metric, verifiedOutcomes: outcomes,
    currentTopology: 'a_team', budget: { tokens: 100 } });
  assert.equal(policy.portfolio.communication.status, 'available');
  assert.equal(policy.portfolio.calibration.scales.COMMUNICATION_REDUCTION.status, 'calibrated');
  assert.equal(policy.decision.interventionScale, 'COMMUNICATION_REDUCTION');
  assert.equal(policy.decision.recipe.candidateId, intervention.CANDIDATE_ID);

  const state = { normalizedMission: { missionId: id, prompt: 'Continue safely',
      organization: 'research', requiredTools: ['genos_search'] },
    plan: { selectedTopology: 'a_team', tokenPolicy: {} },
    workers: new Map([[mission.agentId, mission]]),
    results: new Map([[mission.agentId, { agentId: mission.agentId, status: 'completed', evidenceScore: 40, payload: {} }]]) };
  let requestedMissionId = null;
  const planned = await continuationPlanner.planContinuation({ state, survivors: [{ agentId: mission.agentId }],
    continuation: { pool: 100, perWorkerTokens: 20 }, orchestratorId: id }, {
    loadVerifiedOutcomes: async () => outcomes,
    loadVerifiedCommunicationMetric: async (query) => { requestedMissionId = query.missionId; return metric; }
  });
  assert.equal(requestedMissionId, id);
  assert.equal(planned.adapted, true);
  assert.equal(planned.communicationIntervention.candidateId, intervention.CANDIDATE_ID);
  assert.equal(planned.receipt.communicationMetricReceipt.resultId, metric.id);
}

function verifyNoChangeAndUnavailable() {
  const mission = eligibleMission('no-change');
  assert.equal(intervention.applyCommunicationReduction(mission, null).reason, 'NO_CHANGE');
  assert.equal(intervention.describeAvailability(mission).status, 'unavailable');
  assert.equal(intervention.describeAvailability({ ...mission, communicationRequired: true }, metricFor(mission.missionId)).reason,
    'communication_required_by_mission');
  assert.equal(intervention.describeAvailability({ ...mission, organization: 'cross_functional_pod' }, metricFor(mission.missionId)).reason,
    'communication_required_by_organization');
  assert.equal(intervention.describeAvailability({ ...mission, requiredTools: [...mission.requiredTools, 'genos_worker_publish'] },
    metricFor(mission.missionId)).reason, 'coordination_tools_required');
  assert.equal(intervention.describeAvailability(mission, { ...metricFor(mission.missionId), missionId: 'other' }).status,
    'unavailable', 'a metric from another mission cannot authorize the action');
}

async function verifyBoundaryEffectReachesRuntime() {
  const id = 'communication-reduction-next-epoch';
  const mission = eligibleMission(id);
  const measurement = metricFor(id);
  const availability = intervention.describeAvailability(mission, measurement);
  assert.equal(availability.status, 'available');
  const selected = { candidateId: availability.candidateId, scale: availability.scale, status: 'selected' };
  const state = { db: {}, workers: new Map([[mission.agentId, mission]]),
    normalizedMission: { missionId: id, prompt: 'Continue with evidence.' } };
  const originalPersist = durable.persistContinuations;
  durable.persistContinuations = async ({ continuations }) => {
    assert.equal(continuations[0].mission.coordinationPolicy.communicationCadence, 'barrier_only');
    assert.deepEqual(continuations[0].mission.toolLease, ['genos_search']);
    assert.equal(continuations[0].mission.communicationIntervention.status, 'applied_at_epoch_boundary');
    assert.equal(continuations[0].mission.communicationIntervention.transitionId, 'transition-communication-test');
    assert.equal(preflight.continuousCoordination(continuations[0].mission), false);
    assert.deepEqual(preflight.requiredWorkerTools(continuations[0].mission), []);
  };
  try {
    await queue.queueContinuationMissions([{ state, survivor: { agentId: mission.agentId, payload: {} },
      continuation: { perWorkerTokens: 50 }, index: 0, orchestratorId: id,
      adaptation: { communicationIntervention: selected, communicationMetric: measurement,
        receipt: { transitionId: 'transition-communication-test' } }, epoch: 1 }]);
    const queued = pendingContinuations.get(mission.agentId);
    assert.equal(queued.communicationIntervention.candidateId, intervention.CANDIDATE_ID,
      'the durable next-epoch mission carries the applied intervention identity');
  } finally {
    durable.persistContinuations = originalPersist;
    pendingContinuations.delete(mission.agentId);
  }
}

async function verifyStaleUnsafeSelectionBlocksQueue() {
  const mission = eligibleMission('unsafe-selection');
  const originalPersist = durable.persistContinuations;
  durable.persistContinuations = async () => { throw new Error('must not persist an unsafe action'); };
  try {
    await assert.rejects(queue.queueContinuationMissions([{ state: { db: {}, workers: new Map([[mission.agentId, mission]]),
      normalizedMission: { missionId: mission.missionId } }, survivor: { agentId: mission.agentId, payload: {} },
    continuation: { perWorkerTokens: 50 }, index: 0, orchestratorId: mission.missionId,
    adaptation: { communicationIntervention: { candidateId: intervention.CANDIDATE_ID,
      scale: 'COMMUNICATION_REDUCTION', status: 'selected' } } }]),
    { code: 'MORPHOGENESIS_COMMUNICATION_INTERVENTION_UNAVAILABLE' });
    assert.equal(pendingContinuations.has(mission.agentId), false);
  } finally {
    durable.persistContinuations = originalPersist;
    pendingContinuations.delete(mission.agentId);
  }
}

async function main() {
  verifyNoChangeAndUnavailable();
  await verifySelectorCalibrationAndOptionalLoader();
  await verifyBoundaryEffectReachesRuntime();
  await verifyStaleUnsafeSelectionBlocksQueue();
  console.log('✓ morphogenesis communication reduction is evidence-gated and applied only to the next epoch');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
