'use strict';

const recruitment = require('./morphogenesisEpochRecruitment');

async function validateFundedStrategy(context) {
  const { input, adaptation, funded, reservation, assertQuiescence } = context;
  if (adaptation.communicationIntervention) return validateCommunicationIntervention(context);
  if (!adaptation.adapted && !adaptation.cohortBlueprint) {
    return { status: 'not_applicable', executionAuthorized: false,
      reason: 'no_morphogenesis_transition_or_cohort_replacement' };
  }
  if (adaptation.admission?.status !== 'admitted') {
    return { status: 'denied', reason: 'pre_admission_missing' };
  }
  const { state, orchestratorId } = input;
  const assignments = funded.survivors.map((survivor, index) => ({
    ...recruitment.cohortAssignment(adaptation.cohortBlueprint, survivor, index),
    tokenBudget: funded.workerTokens[index]
  }));
  return runFundedAdmission({ input, adaptation, reservation, assignments, assertQuiescence });
}

async function validateCommunicationIntervention(context) {
  const { input, adaptation, funded, reservation, assertQuiescence } = context;
  const candidateId = adaptation.communicationIntervention.candidateId;
  if (!policyCalibratesCommunication(adaptation, candidateId)) {
    return { status: 'denied', reason: 'communication_action_not_calibrated_by_policy' };
  }
  const intervention = require('./communicationReductionIntervention');
  const workers = funded.survivors.map((survivor) => input.state.workers.get(survivor.agentId) || {});
  if (!workersAvailable(intervention, workers, adaptation.communicationMetric)) {
    return { status: 'denied', reason: 'communication_action_runtime_preconditions_changed' };
  }
  if (!fundedBudgetFits(funded, reservation)) {
    return { status: 'denied', reason: 'communication_action_budget_mismatch' };
  }
  const quiescence = await assertQuiescence(input.state, input.orchestratorId);
  return { status: 'admitted', executionAuthorized: true,
    selectionBasis: 'calibrated_communication_policy', comparativeQuality: 'unknown',
    unexecutedAlternatives: [],
    counterfactual: { sameMissionComparison: 'unobserved', comparativeClaim: 'prohibited',
      unexecutedCount: 0, rankingAvailable: false,
      reason: 'unexecuted_alternatives_have_no_observed_outcome_for_this_mission' },
    recipe: { id: candidateId, scale: 'COMMUNICATION_REDUCTION' }, actualPlan: adaptation.plan || null,
    communicationMetricReceipt: adaptation.communicationMetric.receipt,
    gates: { policyProposal: true, calibration: true, metricReceipt: true,
      workerPreconditions: true, budget: true, quiescence: quiescence.confirmed } };
}

function policyCalibratesCommunication(adaptation, candidateId) {
  const policy = adaptation.decision?.policy;
  const calibrated = policy?.portfolio?.calibration?.scales?.COMMUNICATION_REDUCTION?.candidates?.[candidateId];
  return policy?.decision?.interventionScale === 'COMMUNICATION_REDUCTION'
    && policy.decision.recipe?.candidateId === candidateId && calibrated?.status === 'calibrated';
}

function workersAvailable(intervention, workers, metric) {
  return workers.length > 0 && workers.every((worker) =>
    intervention.describeAvailability(worker, metric).status === 'available');
}

function fundedBudgetFits(funded, reservation) {
  const tokens = funded.workerTokens.reduce((sum, value) => sum + Number(value || 0), 0);
  return Number.isSafeInteger(tokens) && tokens > 0 && tokens <= reservation.reservedTokens;
}

async function runFundedAdmission(context) {
  const { input, adaptation, reservation, assignments, assertQuiescence } = context;
  const { state, orchestratorId } = input;
  const allowedTools = require('../agentOrchestrationState').orchestratorToolLease(state.plan);
  const quiescence = await assertQuiescence(state, orchestratorId);
  const mission = state.normalizedMission || {};
  const admissionService = require('./morphogenesisStrategyAdmission');
  const admission = adaptation.admission.selectionBasis === 'calibrated_policy_proposal'
    ? admissionService.admitMorphogenesisStrategy : admissionService.admitPlannerTransition;
  return admission({
    policy: adaptation.decision?.policy,
    actualPlan: { ...adaptation.plan, workerAssignments: assignments,
      allocatedTokens: fundedTokens(assignments),
      requestedTools: Array.isArray(state.plan?.requiredTools) ? state.plan.requiredTools : [] },
    quiescence, parentLease: { allowedTools },
    topologyCapabilities: mission.topologyCapabilityInventory?.available,
    availableWorkerKinds: Object.keys(require('../agents/workerKindService').KINDS),
    budget: { availableTokens: reservation.reservedTokens },
    resourceResolution: adaptation.admission?.resourceResolution || null,
    resourceReservation: adaptation.admission?.resourceReservation || null
  });
}

function fundedTokens(assignments) {
  return assignments.reduce((sum, assignment) => sum + assignment.tokenBudget, 0);
}

module.exports = { validateFundedStrategy };
