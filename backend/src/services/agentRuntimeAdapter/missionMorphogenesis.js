'use strict';

function buildMissionMorphogenesisInput(ctx) {
  const topology = proposedTopology(ctx);
  const capabilityPlan = ctx.normalizedMission.missionCapabilityPlan || {};
  return {
    db: ctx.db,
    missionId: ctx.agentId,
    problem: missionText(ctx.normalizedMission),
    problemProfile: { ...resolvedProblemProfile(ctx), domains: capabilityPlan.domains || [],
      capabilityRequirements: capabilityPlan.capabilityRequirements || [] },
    currentState: currentMorphologyState(ctx, capabilityPlan),
    proposedTopology: topology,
    topologyProfile: topology ? { baseTopology: topology } : undefined,
    budget: missionBudget(ctx, capabilityPlan),
    pressure: missionPressure(ctx),
    expression: ctx.normalizedMission.morphologyExpression,
    missionAssignments: missionAssignments(ctx)
  };
}

function missionText(mission) {
  return mission.prompt || mission.currentTask || '';
}

function resolvedProblemProfile(ctx) {
  return { ...(ctx.contractRecord?.contract?.problem_profile || {}), ...(ctx.autonomyPlan.profile || {}) };
}

function proposedTopology(ctx) {
  const plan = ctx.autonomyPlan;
  const mission = ctx.normalizedMission;
  const requested = mission.missionCapabilityPlan?.topology
    || (plan.trinity?.activated ? 'trinity'
      : plan.aTeam?.activated ? 'a_team'
        : mission.proposedTopology || mission.morphologyTopology || null);
  const { isTopology } = require('../morphogenesis/morphogenesisOntology');
  return isTopology(requested) ? requested : null;
}

function currentMorphologyState(ctx, capabilityPlan) {
  const mission = ctx.normalizedMission;
  const { isTopology } = require('../morphogenesis/morphogenesisOntology');
  return {
    topology: isTopology(mission.currentTopology) ? mission.currentTopology : null,
    organization: ctx.autonomyPlan.organization || null,
    capabilities: capabilityPlan.capabilityRequirements || []
  };
}

function missionBudget(ctx, capabilityPlan) {
  return { tokens: ctx.autonomyPlan.tokenPolicy?.total || capabilityPlan.budgets?.tokens || 0 };
}

function missionPressure(ctx) {
  return Number(resolvedProblemProfile(ctx).uncertainty) || 0;
}

function missionAssignments(ctx) {
  const assignments = ctx.autonomyPlan.dispatchWorkers;
  if (!Array.isArray(assignments)) return [];
  return assignments.map((assignment) => ({ ...assignment }));
}

module.exports = { buildMissionMorphogenesisInput };
