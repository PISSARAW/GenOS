'use strict';

function routing(mission) {
  return { modelTier: mission.modelTier || '', provider: mission.provider || '',
    modelId: mission.modelId || '', hostExecutionContextJson: JSON.stringify(mission.hostExecutionContext || {}),
    localModel: mission.localModel || '', localRoutingPolicyJson: JSON.stringify(mission.localRoutingPolicy || {}) };
}

function worker(mission) {
  return { variantIndex: Number.isInteger(mission.variantIndex) ? mission.variantIndex : 0,
    capabilities: mission.capabilities || [], capabilityManifestJson: mission.capabilityManifestJson || null,
    workerKind: mission.workerKind || '', workerContractJson: JSON.stringify(mission.workerContract || {}) };
}

function valueOr(value, fallback) {
  return value || fallback;
}

function firstOr(first, second, fallback) {
  return first || second || fallback;
}

function optionalJson(value) {
  return value ? JSON.stringify(value) : '';
}

function execution(ctx) {
  const mission = ctx.normalizedMission;
  return { workspaceRoot: ctx.workspaceRoot, workspaceIsolation: valueOr(mission.workspaceIsolation, ''),
    executionRunId: valueOr(ctx.executionRun?.id, ''),
    ...checkpoint(ctx),
    agentType: valueOr(mission.agentType, ''), executionMode: ctx.dispatchedAgent.execution_mode,
    orchestratorAgentId: valueOr(mission.orchestratorAgentId, ''), missionId: valueOr(mission.missionId, ''),
    episodeId: firstOr(mission.episodeId, mission.missionScope?.episodeId, ''),
    threadId: firstOr(mission.threadId, mission.missionScope?.threadId, ''),
    organizationId: valueOr(ctx.controlTenant?.organization_id, ''),
    projectId: valueOr(ctx.controlTenant?.project_id, ''),
    memoryContextJson: optionalJson(mission.memoryContext),
    autonomyPlanJson: JSON.stringify(runtimeAutonomyPlan(valueOr(ctx.autonomyPlan, {}))),
    toolLeaseJson: JSON.stringify(valueOr(mission.toolLease, [])),
    organization: valueOr(mission.organization, ''),
    coordinationPolicyJson: JSON.stringify(firstOr(mission.coordinationPolicy, mission.coordination_policy, {})),
    genosCapsuleJson: JSON.stringify(ctx.genosCapsule), executionPolicyJson: JSON.stringify(mission.executionPolicy),
    modelBudgetScopeJson: optionalJson(mission.modelBudgetScope),
    executionBudgetJson: JSON.stringify(valueOr(ctx.runtimeBudget, {})) };
}

function runtimeAutonomyPlan(plan) {
  // Synthesis plans can contain every worker dossier and the complete
  // morphogenesis trace. The runtime needs the execution contract and stable
  // mission plan, while the source plan remains available in durable state.
  // Passing the whole plan through stdin can exceed the runtime's 1 MiB guard.
  const fields = ['schema', 'synthesisOnly', 'completedWorkerIds', 'profile', 'organization',
    'organizationPolicy', 'phases', 'executionStatus', 'executionBlockers', 'omittedPhases',
    'requiredTools', 'mandatoryTools', 'dispatchWorkers', 'competition', 'evolution', 'parasitism',
    'aTeam', 'trinity', 'localModelReview', 'tokenPolicy', 'nativeMissionPlan'];
  if (plan.synthesisOnly === true) fields.push('completedWorkerDossiers');
  return Object.fromEntries(fields.filter(key => plan[key] !== undefined).map(key => [key, plan[key]]));
}

function checkpoint(ctx) {
  return { workspaceId: ctx.normalizedMission.workspaceId || ctx.dispatchedAgent.workspace_id || '',
    resumeCheckpointId: ctx.normalizedMission.resumeCheckpointId || '',
    runtimeCheckpointEnabled: require('./agentRuntimeExecutable').isLocalRuntime(ctx.resolvedExecutable) };
}

function build(ctx, identity, runtimeStrategyContract) {
  return { ...identity, ...routing(ctx.normalizedMission), ...execution(ctx), ...worker(ctx.normalizedMission),
    strategyContractJson: JSON.stringify(runtimeStrategyContract) };
}

module.exports = { build, runtimeAutonomyPlan };
