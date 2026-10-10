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

function execution(ctx) {
  const mission = ctx.normalizedMission;
  return { workspaceRoot: ctx.workspaceRoot, workspaceIsolation: mission.workspaceIsolation || '',
    ...checkpoint(ctx),
    agentType: mission.agentType || '', executionMode: ctx.dispatchedAgent.execution_mode,
    orchestratorAgentId: mission.orchestratorAgentId || '', missionId: mission.missionId || '',
    autonomyPlanJson: JSON.stringify(ctx.autonomyPlan || {}), toolLeaseJson: JSON.stringify(mission.toolLease || []),
    genosCapsuleJson: JSON.stringify(ctx.genosCapsule), executionPolicyJson: JSON.stringify(mission.executionPolicy),
    executionBudgetJson: JSON.stringify(ctx.runtimeBudget || {}) };
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

module.exports = { build };
