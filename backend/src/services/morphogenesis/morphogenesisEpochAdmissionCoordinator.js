'use strict';

const recruitment = require('./morphogenesisEpochRecruitment');

async function validateFundedStrategy(context) {
  const { input, adaptation, funded, reservation, assertQuiescence } = context;
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
    budget: { availableTokens: reservation.reservedTokens }
  });
}

function fundedTokens(assignments) {
  return assignments.reduce((sum, assignment) => sum + assignment.tokenBudget, 0);
}

module.exports = { validateFundedStrategy };
