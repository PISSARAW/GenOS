const agentAuthority = require('../agentAuthorityService');
const agentCapsules = require('../agentCapsuleService');
const { localWorkerRoute } = require('../agentModelRoutingService');
const { provisionMissionWorkspace } = require('../agentWorkspaceLifecycleService');
const { bundledRuntimeEnvironment, configuredExecutable, runtimeAvailability } = require('../agentRuntimeExecutable');
const { validateBudgetCoherence, normalizeMissionBudget, validateShareSum } = require('../budgetCoherenceService');
const { emit, cancelledStarts } = require('../agentOrchestrationState');
const { assertCallerMcpConfiguration } = require('../cognitiveExecutor');
const { withWriteRetry } = require('../../db');

function assertMissionNotCancelled(agentId) {
  if (cancelledStarts.has(agentId)) {
    const error = new Error(`Mission '${agentId}' was stopped before its runtime started.`);
    error.code = 'MISSION_CANCELLED';
    throw error;
  }
}

async function resolveWorkerIdentity(normalizedMission, dispatchedAgent) {
  const workerKinds = require('../agents/workerKindService');
  if (dispatchedAgent.execution_mode !== 'worker') return;
  const requestedKind = workerKinds.resolveWorkerKind(normalizedMission.workerKind, normalizedMission.role || dispatchedAgent.role);
  if (dispatchedAgent.workerKind && dispatchedAgent.workerKind !== requestedKind) {
    throw Object.assign(new Error('Dispatched worker kind does not match the persisted worker identity.'), { code: 'WORKER_KIND_MISMATCH' });
  }
  normalizedMission.workerKind = dispatchedAgent.workerKind || requestedKind;
  const persistedContract = persistedWorkerContract(dispatchedAgent);
  if (persistedContract) {
    if (persistedContract.identity?.parentId !== dispatchedAgent.parent_agent_id) {
      const code = normalizedMission.workerKind === 'sub_orchestrator' ? 'INVALID_SUBORCHESTRATOR_CONTRACT' : 'INVALID_WORKER_CONTRACT';
      throw Object.assign(new Error('Persisted worker contract has a different parent.'), { code });
    }
    normalizedMission.workerContract = persistedContract;
  } else {
    normalizedMission.workerContract = workerKinds.buildWorkerContract(normalizedMission.workerKind, normalizedMission);
  }
  require('../agents/workerContractEnforcement').assertRuntimeContract(normalizedMission.workerContract, normalizedMission.workerKind);
}

function persistedWorkerContract(agent) {
  try {
    const metadata = typeof agent.metadata_json === 'string' ? JSON.parse(agent.metadata_json) : agent.metadata_json || {};
    return metadata.workerContract || null;
  } catch (_) {
    throw Object.assign(new Error('Persisted worker metadata is invalid.'), { code: 'INVALID_WORKER_CONTRACT' });
  }
}

async function initializeMissionContext(mission) {
  const agentId = mission.agentId || mission.id;
  assertMissionNotCancelled(agentId);
  const normalizedMission = { ...mission, agentId };
  assertCallerMcpConfiguration(normalizedMission);
  const { strategy_decisions: _decisionLedger, ...runtimeStrategyContract } = normalizedMission.strategyContract || {};
  const executable = configuredExecutable(normalizedMission);
  // Workers freshly spawned by a parent orchestrator contend on the same SQLite
  // file (WAL single-writer). Retry the DB open so the child can bootstrap
  // without immediately failing on SQLITE_BUSY / SQLITE_MISUSE.
  const db = await withWriteRetry(
    () => require('../../db').getDatabase(),
    { maxRetries: 10, baseDelayMs: 200 }
  );
  assertMissionNotCancelled(agentId);
  const dispatchedAgent = await agentAuthority.authorizeMission(db, agentId, normalizedMission.orchestratorAgentId, normalizedMission.workspaceId || null);
  await resolveWorkerIdentity(normalizedMission, dispatchedAgent);
  normalizedMission.name = normalizedMission.name || dispatchedAgent.name;
  normalizedMission.nameMeaning = normalizedMission.nameMeaning || dispatchedAgent.name_meaning;
  return { mission, agentId, normalizedMission, executable, db, dispatchedAgent };
}

async function resolveMissionContract(ctx) {
  const { executable, db, agentId, normalizedMission, dispatchedAgent } = ctx;
  const availability = runtimeAvailability(executable);
  if (!availability.available) throw new Error(availability.reason);
  const strategyContracts = require('../strategyContractService');
  let contractRecord = await strategyContracts.getLatestContract(db, agentId, dispatchedAgent.workspace_id);
  if (!contractRecord && normalizedMission.orchestratorAgentId) {
    const parent = await db.get('SELECT workspace_id FROM agents WHERE id = ?', normalizedMission.orchestratorAgentId);
    contractRecord = await strategyContracts.getLatestContract(db, normalizedMission.orchestratorAgentId, parent?.workspace_id || dispatchedAgent.workspace_id);
  }
  if (!contractRecord) throw new Error(`No strategy contract available for agent ${agentId}`);
  ctx.contractRecord = contractRecord;
}

async function resolveLocalModel(ctx) {
  const nm = ctx.normalizedMission;
  if (nm.executor === 'caller_mcp' || ctx.dispatchedAgent.execution_mode !== 'worker' || (nm.localModel && nm.disableLocalModel !== true)) return;
  const workerTenant = nm.workspaceId
    ? await ctx.db.get('SELECT organization_id AS organizationId, project_id AS projectId FROM workspaces WHERE id = ?', nm.workspaceId)
    : null;
  const route = await localWorkerRoute(ctx.db, ctx.agentId, nm.role, nm.modelTier, workerTenant || {});
  nm.localModel = route.selectedModel;
  nm.localRoutingPolicy = route.policy;
  nm.localRoutingCriteria = route.criteria;
}

async function provisionWorkspaceAndModel(ctx) {
  const { db, agentId, normalizedMission, dispatchedAgent } = ctx;
  Object.assign(normalizedMission, await provisionMissionWorkspace(normalizedMission, dispatchedAgent.execution_mode));
  assertMissionNotCancelled(agentId);
  await resolveLocalModel(ctx);
}

function resolvePlanForCheck(normalizedMission) {
  const planPolicy = normalizedMission.autonomyPlan?.tokenPolicy || normalizedMission.tokenPolicy || null;
  if (planPolicy) return { tokenPolicy: planPolicy };
  return null;
}

function normalizeMissionBudgets(ctx) {
  const { normalizedMission } = ctx;
  if (normalizedMission.timeoutMs && !normalizedMission.workerBarrierTimeoutMs) {
    normalizedMission.workerBarrierTimeoutMs = Math.max(2000, Math.floor(normalizedMission.timeoutMs * 0.45));
  }
  const runtimeEnvironment = bundledRuntimeEnvironment();
  const normalizedExecutionBudget = normalizeMissionBudget(normalizedMission.executionBudget || {});
  const planForCheck = resolvePlanForCheck(normalizedMission);
  const shareError = planForCheck ? null : validateShareSum([normalizedExecutionBudget.workerShare, normalizedExecutionBudget.orchestratorReserve]);
  if (shareError) {
    throw Object.assign(new Error(`Budget coherence validation failed: ${shareError}`), { code: 'BUDGET_COHERENCE_FAILURE' });
  }
  const budgetCoherence = planForCheck ? validateBudgetCoherence({
    executionBudget: normalizedExecutionBudget,
    autonomyPlan: planForCheck
  }) : { valid: true };
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
  resolveWorkerIdentity,
  initializeMissionContext,
  resolveMissionContract,
  provisionWorkspaceAndModel,
  normalizeMissionBudgets,
  provisionMissionCapsule,
  enableMissionMonitoring
};
