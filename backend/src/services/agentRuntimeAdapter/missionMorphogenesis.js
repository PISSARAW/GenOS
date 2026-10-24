'use strict';

function buildMissionMorphogenesisInput(ctx) {
  const topology = proposedTopology(ctx);
  const problem = missionText(ctx.normalizedMission);
  const capabilityPlan = ctx.normalizedMission.missionCapabilityPlan || {};
  const input = {
    db: ctx.db,
    missionId: ctx.agentId,
    problem,
    problemProfile: { ...require('../morphogenesis/missionTopologySignals').inferMissionTopologySignals(problem),
      ...resolvedProblemProfile(ctx), domains: capabilityPlan.domains || [],
      capabilityRequirements: capabilityPlan.capabilityRequirements || [],
      developmentalContext: ctx.normalizedMission.developmentalContext || null,
      strategyConcept: ctx.normalizedMission.strategyConcept || null },
    currentState: currentMorphologyState(ctx, capabilityPlan),
    proposedTopology: topology,
    topologyProfile: topology ? { baseTopology: topology } : undefined,
    variantId: ctx.normalizedMission.morphology?.variantId || undefined,
    budget: missionBudget(ctx, capabilityPlan),
    pressure: missionPressure(ctx),
    expression: ctx.normalizedMission.morphologyExpression,
    missionAssignments: missionAssignments(ctx)
  };
  const withNosology = require('../morphogenesis/missionNosologyContext')
    .enrichPlanningInput(input, ctx.morphogenesisNosology);
  return require('../morphogenesis/morphogenesisGenomeContext')
    .enrichPlanningInput(withNosology, ctx.morphogenesisGenomeContext);
}

function missionText(mission) {
  return mission.prompt || mission.currentTask || '';
}

function resolvedProblemProfile(ctx) {
  return { ...(ctx.contractRecord?.contract?.problem_profile || {}), ...(ctx.autonomyPlan?.profile || {}) };
}

function proposedTopology(ctx) {
  const plan = ctx.autonomyPlan || {};
  const mission = ctx.normalizedMission;
  const requested = mission.missionCapabilityPlan?.topology
    || mission.mission_capability_plan?.topology
    || mission.topologyId || mission.topology_id
    || (plan.trinity?.activated ? 'trinity'
      : plan.aTeam?.activated ? 'a_team'
        : mission.proposedTopology || mission.proposed_topology || mission.morphologyTopology
          || mission.morphology_topology || mission.morphology?.topology || null);
  const { isTopology } = require('../morphogenesis/morphogenesisOntology');
  return isTopology(requested) ? requested : null;
}

function currentMorphologyState(ctx, capabilityPlan) {
  const mission = ctx.normalizedMission;
  const plan = ctx.autonomyPlan || {};
  const { isTopology } = require('../morphogenesis/morphogenesisOntology');
  return {
    topology: isTopology(mission.currentTopology) ? mission.currentTopology : null,
    organization: plan.organization || null,
    capabilities: capabilityPlan.capabilityRequirements || []
  };
}

function missionBudget(ctx, capabilityPlan) {
  return { tokens: ctx.autonomyPlan?.tokenPolicy?.total
    || ctx.normalizedMission.executionBudget?.tokens || capabilityPlan.budgets?.tokens || 0 };
}

function missionPressure(ctx) {
  return Number(resolvedProblemProfile(ctx).uncertainty) || 0;
}

function missionAssignments(ctx) {
  const assignments = ctx.autonomyPlan?.dispatchWorkers;
  if (!Array.isArray(assignments)) return [];
  return assignments.map((assignment) => ({ ...assignment }));
}

module.exports = { buildMissionMorphogenesisInput };
