const agentAuthority = require('../agentAuthorityService');
const agentCapsules = require('../agentCapsuleService');
const { localWorkerRoute } = require('../agentModelRoutingService');
const { provisionMissionWorkspace } = require('../agentWorkspaceLifecycleService');
const { bundledRuntimeEnvironment, configuredExecutable, runtimeAvailability } = require('../agentRuntimeExecutable');
const { validateBudgetCoherence, normalizeMissionBudget, validateShareSum } = require('../budgetCoherenceService');
const { emit, cancelledStarts } = require('../agentOrchestrationState');
const { assertCallerMcpConfiguration } = require('../cognitiveExecutor');
const { withWriteRetry, withTransaction } = require('../../db');

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
  const contractEnforcement = require('../agents/workerContractEnforcement');
  contractEnforcement.assertRuntimeContract(normalizedMission.workerContract, normalizedMission.workerKind);
  contractEnforcement.assertAssignmentMatches(normalizedMission.workerContract, normalizedMission);
  require('../agents/workerRuntimeLimitsService').assertWorkerExecutorAvailable(normalizedMission);
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
  normalizeRequestedExecutor(normalizedMission);
  assertCallerMcpConfiguration(normalizedMission);
  attachHostExecutionContext(normalizedMission);
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
  await require('../missionExecutionAuthority').assertAuthority(db, normalizedMission.missionExecutionAuthority);
  await require('../garageRuntimeService').assertLease(db, normalizedMission);
  const dispatchedAgent = await agentAuthority.authorizeMission(db, agentId, normalizedMission.orchestratorAgentId, normalizedMission.workspaceId || null);
  if (normalizedMission.resumeCheckpointId) {
    await require('../runtimeCheckpointRequest').assertResumeRequest(db, {
      checkpointId: normalizedMission.resumeCheckpointId, agentId,
      workspaceId: dispatchedAgent.workspace_id,
      executable
    });
  }
  await resolveWorkerIdentity(normalizedMission, dispatchedAgent);
  normalizedMission.name = normalizedMission.name || dispatchedAgent.name;
  normalizedMission.nameMeaning = normalizedMission.nameMeaning || dispatchedAgent.name_meaning;
  return { mission, agentId, normalizedMission, executable, db, dispatchedAgent };
}

function normalizeRequestedExecutor(mission) {
  if (!(mission.executor || mission.runtime || process.env.GENOS_AGENT_EXECUTOR)) return;
  mission.executor = require('../cognitiveExecutor').resolveExecutor(mission);
}

function attachHostExecutionContext(mission) {
  if (mission.executor !== 'caller_mcp') return;
  const hostContext = require('../hostExecutionContext').normalizeHostExecutionContext(mission.hostExecutionContext, {
    provider: mission.provider,
    modelId: mission.modelId,
    toolLease: mission.toolLease,
  });
  if (!hostContext.samplingAvailable) {
    throw Object.assign(new Error('caller_mcp host context does not confirm an available sampling channel.'), { code: 'MCP_SAMPLING_UNAVAILABLE' });
  }
  mission.hostExecutionContext = hostContext;
  mission.provider = hostContext.providerId;
  mission.modelId = hostContext.modelId;
}

async function resolveMissionContract(ctx) {
  const { executable, db, agentId, normalizedMission, dispatchedAgent } = ctx;
  const availability = runtimeAvailability(executable);
  const native = require('../agents/workerRuntimeLimitsService').isDeterministicWorkerMission(normalizedMission);
  if (!native && !availability.available) throw new Error(availability.reason);
  const strategyContracts = require('../strategyContractService');
  let contractRecord = await strategyContracts.getLatestContract(db, agentId, dispatchedAgent.workspace_id);
  if (!contractRecord && normalizedMission.orchestratorAgentId) {
    const parent = await db.get('SELECT workspace_id, parent_agent_id, execution_mode FROM agents WHERE id = ?', normalizedMission.orchestratorAgentId);
    contractRecord = await strategyContracts.getLatestContract(db, normalizedMission.orchestratorAgentId, parent?.workspace_id || dispatchedAgent.workspace_id);
    if (!contractRecord && parent?.execution_mode === 'worker') {
      const root = await agentAuthority.requireOrchestrator(db, parent.parent_agent_id);
      contractRecord = await strategyContracts.getLatestContract(db, root.id, root.workspace_id);
    }
  }
  if (!contractRecord) throw new Error(`No strategy contract available for agent ${agentId}`);
  ctx.contractRecord = contractRecord;
}

async function resolveLocalModel(ctx) {
  const nm = ctx.normalizedMission;
  if (require('../agents/workerRuntimeLimitsService').isDeterministicWorkerMission(nm)) return;
  if (nm.executor === 'caller_mcp' || ctx.dispatchedAgent.execution_mode !== 'worker') return;
  const explicitRoute = await require('../agentModelRoutingService').explicitLocalRoute(nm);
  if (explicitRoute) {
    nm.localModel = explicitRoute.selectedModel;
    nm.localRoutingPolicy = explicitRoute.policy;
    nm.localRoutingCriteria = explicitRoute.criteria;
    return;
  }
  if (nm.localModel && nm.disableLocalModel !== true) return;
  const workerTenant = nm.workspaceId
    ? await ctx.db.get('SELECT organization_id AS organizationId, project_id AS projectId FROM workspaces WHERE id = ?', nm.workspaceId)
    : null;
  const route = await localWorkerRoute({ db: ctx.db, agentId: ctx.agentId, role: nm.role, modelTier: nm.modelTier, tenant: workerTenant || {} });
  nm.localModel = route.selectedModel;
  nm.localRoutingPolicy = route.policy;
  nm.localRoutingCriteria = route.criteria;
}

async function provisionWorkspaceAndModel(ctx) {
  const { db, agentId, normalizedMission, dispatchedAgent } = ctx;
  Object.assign(normalizedMission, await provisionMissionWorkspace(normalizedMission, dispatchedAgent.execution_mode));
  assertMissionNotCancelled(agentId);
  await bindMissionWorkerWorkspace(ctx);
  await resolveLocalModel(ctx);
}

async function bindMissionWorkerWorkspace(ctx) {
  const { db, agentId, normalizedMission, dispatchedAgent } = ctx;
  if (dispatchedAgent.execution_mode !== 'worker' || !normalizedMission.workspaceRoot) return;
  const assigned = await db.get('SELECT path FROM workspaces WHERE id = ?', dispatchedAgent.workspace_id);
  const path = require('node:path');
  const current = assigned?.path && path.resolve(assigned.path);
  const requested = path.resolve(normalizedMission.workspaceRoot);
  if (current && (process.platform === 'win32' ? current.toLowerCase() === requested.toLowerCase() : current === requested)) return;
  if (normalizedMission.missionScope?.trinityExperimentId) {
    throw Object.assign(new Error('Trinity mission workspace differs from its sealed worker binding.'), { code: 'TRINITY_WORKER_SCOPE_INVALID' });
  }
  const parent = await db.get('SELECT workspace_id FROM agents WHERE id = ?', dispatchedAgent.parent_agent_id);
  const workspaceId = await withTransaction(db, tx =>
    require('../workerWorkspaceBindingService').bindWorkerWorkspace(tx, {
      workerId: agentId, parentId: dispatchedAgent.parent_agent_id,
      parentWorkspaceId: parent?.workspace_id, workspaceRoot: normalizedMission.workspaceRoot
    }));
  normalizedMission.workspaceId = workspaceId;
  dispatchedAgent.workspace_id = workspaceId;
  await agentAuthority.authorizeMission(db, agentId, normalizedMission.orchestratorAgentId, workspaceId);
}

function resolvePlanForCheck(normalizedMission) {
  const planPolicy = normalizedMission.autonomyPlan?.tokenPolicy || normalizedMission.tokenPolicy || null;
  if (planPolicy) return { tokenPolicy: planPolicy };
  return null;
}

function normalizeMissionBudgets(ctx) {
  const { normalizedMission } = ctx;
  const runtimeEnvironment = bundledRuntimeEnvironment();
  const normalizedExecutionBudget = require('../agents/workerRuntimeLimitsService')
    .applyWorkerRuntimeLimits(normalizedMission, normalizeMissionBudget(normalizedMission.executionBudget || {}));
  if (normalizedMission.timeoutMs && !normalizedMission.workerBarrierTimeoutMs) {
    normalizedMission.workerBarrierTimeoutMs = Math.max(2000, Math.floor(normalizedMission.timeoutMs * 0.45));
  }
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
  const binding = await capsuleBinding(ctx);
  const genosCapsule = await agentCapsules.provision({
    db: ctx.db,
    executable: ctx.runtimeEnvironment.GENOS_BIN,
    workspaceRoot: normalizedMission.workspaceRoot,
    capsuleRoot: normalizedMission.capsuleRoot,
    agentId,
    name: normalizedMission.name || dispatchedAgent.name || agentId,
    role: normalizedMission.role || dispatchedAgent.role || 'GenOS agent',
    ...binding,
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

async function capsuleBinding(ctx) {
  const { normalizedMission: mission, agentId, db } = ctx;
  const experimentId = mission.missionScope?.trinityExperimentId;
  if (!experimentId) return {};
  const world = await db.get('SELECT id, snapshot_hash FROM trinity_worlds WHERE experiment_id = ? AND agent_id = ?',
    experimentId, agentId);
  if (!world || !ctx.executionRun?.id) throw Object.assign(new Error('Trinity capsule requires a bound world and execution run.'), { code: 'TRINITY_CAPSULE_SCOPE_INVALID' });
  return { correlation: { missionId: mission.missionScope.missionId || experimentId,
    trinityExperimentId: experimentId, worldId: world.id, workerId: agentId,
    runId: ctx.executionRun.id, parentId: mission.orchestratorAgentId || null,
    workspaceId: mission.workspaceId || null, tenantId: ctx.dispatchedAgent.organization_id || null },
    sourceSnapshotHash: world.snapshot_hash };
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
