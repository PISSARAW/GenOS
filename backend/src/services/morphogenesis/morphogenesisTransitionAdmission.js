'use strict';

function budgetRoster(assignments, pool) {
  const each = Math.floor(pool / assignments.length);
  const remainder = pool - (each * assignments.length);
  return assignments.map((assignment, index) => ({ ...assignment,
    tokenBudget: each + (index === 0 ? remainder : 0) }));
}

function admissionContext(input, result) {
  const context = input.strategyAdmissionContext || {};
  const blueprint = result.cohortBlueprint?.assignments || [];
  const assignments = budgetRoster(blueprint, Math.max(0, Number(input.continuation.pool) || 0));
  const allocatedTokens = assignments.reduce((sum, assignment) => sum + assignment.tokenBudget, 0);
  return { context, assignments, allocatedTokens,
    actualPlan: { ...result.plan, workerAssignments: assignments, allocatedTokens,
      requestedTools: context.requestedTools || [] } };
}

async function transitionReceipts(input, prepared) {
  const context = prepared.context;
  if (context.resourceResolution && context.resourceReservation) {
    return { resolution: context.resourceResolution, reservation: context.resourceReservation,
      now: context.now, owned: false };
  }
  const now = Date.now();
  const daemonAllowed = input.state.plan?.operationalConstraints?.daemonAllowed;
  const scope = input.req?.tenant || input.state.tenant || input.state.normalizedMission?.tenant || null;
  const resolved = await require('./morphogenesisRuntimeAdmission').resolveAndReserve({
    db: input.state.db, assignments: prepared.assignments, daemonAllowed, now, scope });
  return { resolution: resolved.resolution, reservation: resolved.reservation, now, owned: true };
}

async function admissionForTransition(input, result) {
  const service = require('./morphogenesisStrategyAdmission');
  const prepared = admissionContext(input, result);
  const mission = input.state.normalizedMission || {};
  const kinds = require('../agents/workerKindService').KINDS;
  const policy = result.decision?.policy;
  const admit = policy?.portfolio?.ranking?.decision?.decision === 'PROPOSE'
    ? service.admitMorphogenesisStrategy : service.admitPlannerTransition;
  const receipts = await transitionReceipts(input, prepared);
  const admission = admit({ policy,
    actualPlan: prepared.actualPlan, quiescence: prepared.context.quiescence,
    parentLease: prepared.context.parentLease,
    topologyCapabilities: require('./morphogenesisEpochDecisionService').topologyCapabilities(mission),
    availableWorkerKinds: Object.keys(kinds), budget: { availableTokens: Number(input.continuation.pool) || 0 },
    resourceResolution: receipts.resolution, resourceReservation: receipts.reservation, now: receipts.now });
  if (admission.status !== 'admitted' && receipts.owned) {
    await require('./morphogenesisRuntimeAdmission')
      .releaseAdmissionReservation(input.state.db, { resourceReservation: receipts.reservation, resourceResolution: receipts.resolution });
  }
  return admission;
}

module.exports = { admissionForTransition };
