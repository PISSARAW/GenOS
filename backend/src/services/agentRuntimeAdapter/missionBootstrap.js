const { getDatabase } = require('../../db');
const strategyContracts = require('../strategyContractService');
const agentAuthority = require('../agentAuthorityService');
const agentCapsules = require('../agentCapsuleService');
const { localWorkerRoute } = require('../agentModelRoutingService');
const { provisionMissionWorkspace } = require('../agentWorkspaceLifecycleService');
const { bundledRuntimeEnvironment, configuredExecutable, runtimeAvailability } = require('../agentRuntimeExecutable');
const { validateBudgetCoherence, normalizeMissionBudget } = require('../budgetCoherenceService');
const { emit, cancelledStarts } = require('../agentOrchestrationState');

function assertMissionNotCancelled(agentId) {
  if (cancelledStarts.has(agentId)) {
    const error = new Error(`Mission '${agentId}' was stopped before its runtime started.`);
    error.code = 'MISSION_CANCELLED';
    throw error;
  }
}

async function initializeMissionContext(mission) {
  const agentId = mission.agentId || mission.id;
  assertMissionNotCancelled(agentId);
  const normalizedMission = { ...mission, agentId };
  const { strategy_decisions: _decisionLedger, ...runtimeStrategyContract } = normalizedMission.strategyContract || {};
  const executable = configuredExecutable(normalizedMission);
  const db = await getDatabase();
  assertMissionNotCancelled(agentId);
  const dispatchedAgent = await agentAuthority.authorizeMission(db, agentId, normalizedMission.orchestratorAgentId, normalizedMission.workspaceId || null);
  normalizedMission.name = normalizedMission.name || dispatchedAgent.name;
  normalizedMission.nameMeaning = normalizedMission.nameMeaning || dispatchedAgent.name_meaning;
  return { mission, agentId, normalizedMission, executable, db, dispatchedAgent };
}

async function resolveMissionContract(ctx) {
  const { executable, db, agentId, normalizedMission, dispatchedAgent } = ctx;
  const availability = runtimeAvailability(executable);
  if (!availability.available) throw new Error(availability.reason);
  let contractRecord = await strategyContracts.getLatestContract(db, agentId, dispatchedAgent.workspace_id);
  if (!contractRecord && normalizedMission.orchestratorAgentId) {
    const parent = await db.get('SELECT workspace_id FROM agents WHERE id = ?', normalizedMission.orchestratorAgentId);
    contractRecord = await strategyContracts.getLatestContract(db, normalizedMission.orchestratorAgentId, parent?.workspace_id || dispatchedAgent.workspace_id);
  }
  if (!contractRecord) throw new Error(`No strategy contract available for agent ${agentId}`);
  ctx.contractRecord = contractRecord;
}

async function provisionWorkspaceAndModel(ctx) {
  const { db, agentId, normalizedMission, dispatchedAgent } = ctx;
  Object.assign(normalizedMission, await provisionMissionWorkspace(normalizedMission, dispatchedAgent.execution_mode));
  assertMissionNotCancelled(agentId);
  if (dispatchedAgent.execution_mode === 'worker' && !normalizedMission.localModel && normalizedMission.disableLocalModel !== true) {
    const workerTenant = normalizedMission.workspaceId
      ? await db.get('SELECT organization_id AS organizationId, project_id AS projectId FROM workspaces WHERE id = ?', normalizedMission.workspaceId)
      : null;
    const route = await localWorkerRoute(db, agentId, normalizedMission.role, normalizedMission.modelTier, workerTenant || {});
    normalizedMission.localModel = route.selectedModel;
    normalizedMission.localRoutingPolicy = route.policy;
    normalizedMission.localRoutingCriteria = route.criteria;
  }
}

function normalizeMissionBudgets(ctx) {
  const { normalizedMission } = ctx;
  if (normalizedMission.timeoutMs && !normalizedMission.workerBarrierTimeoutMs) {
    normalizedMission.workerBarrierTimeoutMs = Math.max(2000, Math.floor(normalizedMission.timeoutMs * 0.45));
  }
  const runtimeEnvironment = bundledRuntimeEnvironment();
  const normalizedExecutionBudget = normalizeMissionBudget(normalizedMission.executionBudget || {});
  const budgetCoherence = validateBudgetCoherence({
    executionBudget: normalizedExecutionBudget,
    autonomyPlan: { tokenPolicy: { total: normalizedExecutionBudget.tokens, workerShare: normalizedExecutionBudget.workerShare, orchestratorReserve: normalizedExecutionBudget.orchestratorReserve } }
  });
  if (!budgetCoherence.valid) {
    throw Object.assign(new Error(`Budget coherence validation failed: ${budgetCoherence.reason}`), { code: 'BUDGET_COHERENCE_FAILURE' });
  }
  ctx.runtimeEnvironment = runtimeEnvironment;
  ctx.normalizedExecutionBudget = normalizedExecutionBudget;
  ctx.normalizedRuntimeBudget = {
    ...normalizedExecutionBudget,
    workerShare: normalizedExecutionBudget.workerShare,
    orchestratorReserve: normalizedExecutionBudget.orchestratorReserve
  };
}

async function provisionMissionCapsule(ctx) {
  const { agentId, normalizedMission, dispatchedAgent } = ctx;
  const genosCapsule = await agentCapsules.provision({
    executable: ctx.runtimeEnvironment.GENOS_BIN,
    workspaceRoot: normalizedMission.workspaceRoot,
    capsuleRoot: normalizedMission.capsuleRoot,
    agentId,
    name: normalizedMission.name || dispatchedAgent.name || agentId,
    role: normalizedMission.role || dispatchedAgent.role || 'GenOS agent',
    budgetSteps: normalizedMission.executionBudget?.events || 100,
    fallbackSynthetic: true
  });
  emit(agentId, 'AGENT_CAPSULE_CREATED', 'CAPSULE', `Created GenOS capsule ${genosCapsule.id}.`, genosCapsule, 'info');
  if (dispatchedAgent.execution_mode === 'orchestrator') {
    emit(agentId, 'ORCHESTRATOR_WORKSPACE_CREATED', 'CAPSULE', `Created isolated workspace for orchestrator ${agentId}.`, {
      workspaceRoot: normalizedMission.workspaceRoot
    }, 'info');
  }
  ctx.genosCapsule = genosCapsule;
}

async function enableMissionMonitoring(ctx) {
  const { db, agentId } = ctx;
  await db.run('UPDATE agents SET hallucination_monitoring = 1, hallucination_count = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', agentId);
  emit(agentId, 'HALLUCINATION_MONITORING_ENABLED', 'MONITOR', 'Evidence-bound hallucination monitoring enabled for this mission.', {}, 'info');
}

module.exports = {
  assertMissionNotCancelled,
  initializeMissionContext,
  resolveMissionContract,
  provisionWorkspaceAndModel,
  normalizeMissionBudgets,
  provisionMissionCapsule,
  enableMissionMonitoring
};
