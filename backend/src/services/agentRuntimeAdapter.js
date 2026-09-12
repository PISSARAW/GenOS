/**
 * Provider-neutral bridge between Studio deployments and a real GenOS agent runtime.
 * Coordinates orchestration state, evidence, rounds, fleet, workspaces and process supervisor.
 */
const agentMemoryContext = require('./agentMemoryContext');
const {
  activeProcesses, missionStarts, cancelledStarts, autonomousRounds, activeWorkerBarriers, pendingWorkerRecoveries, pendingContinuations,
  emit, updateAgent, orchestratorToolLease
} = require('./agentOrchestrationState');
const { dispatchPendingContinuation } = require('./agentRoundService');
const { dispatchWorkerRecovery } = require('./agentRecoveryService');
const {
  provisionMissionWorkspace, createIsolatedWorkspace, trackWorkspace
} = require('./agentWorkspaceLifecycleService');
const {
  runLocalWorker, runEvidenceBarrier
} = require('./agentFleetService');
const { superviseMission, runtimeExitOutcome } = require('./agentProcessSupervisor');
const { bundledRuntimeEnvironment, configuredExecutable, runtimeAvailability, isLocalRuntime } = require('./agentRuntimeExecutable');
const { terminateChild } = require('./processTermination');
const {
  assertMissionNotCancelled, initializeMissionContext, resolveMissionContract, provisionWorkspaceAndModel,
  normalizeMissionBudgets, provisionMissionCapsule, enableMissionMonitoring
} = require('./agentRuntimeAdapter/missionBootstrap');
const {
  planMission, applyExecutionPolicy, computeRuntimeBudget, createMissionExecutionRun, reportOrchestratorStart
} = require('./agentRuntimeAdapter/missionPlanning');
const { orchestrateAutonomousWorkers } = require('./agentRuntimeAdapter/missionWorkers');
const { stopMissionChildren, stopPersistedRuntime } = require('./agentRuntimeAdapter/missionShutdown');
const {
  reconcilePersistedRuntimeRow, reconcileOrphanedRunning
} = require('./agentRuntimeAdapter/missionReconcile');
const leasePolicy = require('./toolLeasePolicy');
const agentAuthority = require('./agentAuthorityService');

async function attachMissionMemoryContext(normalizedMission, agentId) {
  const task = normalizedMission.prompt || normalizedMission.currentTask || '';
  if (!task.trim() || normalizedMission.useMemoryContext === false) return normalizedMission;
  try {
    const memoryPrompt = await agentMemoryContext.formatCognitiveMemoryPrompt(agentId, task, {
      organizationId: normalizedMission.organizationId,
      projectId: normalizedMission.projectId,
      sessionId: normalizedMission.sessionId,
      taskId: normalizedMission.taskId
    });
    if (memoryPrompt && memoryPrompt.trim()) {
      normalizedMission.prompt = `${task}\n\nGENOS MEMORY CONTEXT\n${memoryPrompt}`;
      normalizedMission.memoryContextAttached = true;
    }
  } catch (error) {
    normalizedMission.memoryContextAttached = false;
    normalizedMission.memoryContextError = error.message;
  }
  return normalizedMission;
}

function isInProcessWorker(dispatchedAgent, normalizedMission, executable) {
  return (dispatchedAgent.execution_mode === 'worker' && (
    process.env.GENOS_IN_PROCESS_WORKERS === '1' ||
    normalizedMission.inProcessWorker === true
  )) || (normalizedMission.localModel && (normalizedMission.localRuntime === true || isLocalRuntime(executable)));
}

async function bootstrapMission(mission) {
  const ctx = await initializeMissionContext(mission);
  await resolveMissionContract(ctx);
  await provisionWorkspaceAndModel(ctx);
  normalizeMissionBudgets(ctx);
  await provisionMissionCapsule(ctx);
  await enableMissionMonitoring(ctx);
  await planMission(ctx);
  await attachMissionMemoryContext(ctx.normalizedMission, ctx.agentId);
  assertMissionNotCancelled(ctx.agentId);
  applyExecutionPolicy(ctx);
  enforceMissionToolLease(ctx);
  computeRuntimeBudget(ctx);
  await createMissionExecutionRun(ctx);
  reportOrchestratorStart(ctx);
  return ctx;
}

// Fail-closed lease enforcement (bug #6.1): a caller-supplied toolLease can
// only ever RESTRICT the policy-derived lease, never widen it, and every
// `genos_orchestrate` spelling is stripped. The provided lease is verified
// against the CURRENT role first so a lease frozen before a role mutation
// fails with AGENT_TOOL_LEASE_STALE instead of running over-privileged.
function enforceMissionToolLease(ctx) {
  const dispatched = ctx.dispatchedAgent || {};
  const mission = ctx.normalizedMission || {};
  const role = mission.role || dispatched.role;
  const provided = mission.toolLease;
  agentAuthority.assertToolLeaseFresh(
    { id: ctx.agentId, execution_mode: dispatched.execution_mode, role },
    provided,
    ctx.autonomyPlan
  );
  const policy = leasePolicy.derivePolicyLease(dispatched.execution_mode, role, ctx.autonomyPlan);
  mission.toolLease = leasePolicy.restrictProvidedLease(provided, policy);
  ctx.normalizedMission = mission;
}

// Cascade-of-death guard (bug #7.7): only reap `running` children of parents
// in a DESTRUCTIVE state (apoptosis/terminated/error). A `completed` parent
// is a success, never a kill signal, and `blocked` children are budget/guard
// holds that must survive reconciliation.
async function reconcileDeadOrchestratorChildren(db) {
  const result = await db.run(`
    UPDATE agents
    SET status = 'terminated', current_task = 'Terminated following parent orchestrator termination/apoptosis',
        runtime_pid = NULL, runtime_started_at = NULL, runtime_executable = NULL, updated_at = CURRENT_TIMESTAMP
    WHERE parent_agent_id IN (
      SELECT id FROM agents WHERE execution_mode = 'orchestrator' AND (status IN ('apoptosis', 'terminated', 'error') OR is_apoptotic = 1)
    ) AND execution_mode = 'worker' AND status = 'running'
  `);
  return result?.changes || 0;
}

async function startMissionInternal(mission) {
  const ctx = await bootstrapMission(mission);
  const { agentId, normalizedMission, db, dispatchedAgent, executionRun } = ctx;
  assertMissionNotCancelled(agentId);
  const inProcessWorker = isInProcessWorker(dispatchedAgent, normalizedMission, ctx.executable);
  if (inProcessWorker) {
    await trackWorkspace(agentId, normalizedMission.workspaceRoot);
    return runLocalWorker(db, normalizedMission, executionRun);
  }

  // The orchestrator creates and dispatches its own bounded worker fleet. A worker
  // never recurses here: authority is deliberately one-way.
  const autonomousWorkers = await orchestrateAutonomousWorkers(ctx);
  if (autonomousWorkers.length) {
    try {
      await runEvidenceBarrier({ db, agentId, normalizedMission, autonomyPlan: ctx.autonomyPlan, contractRecord: ctx.contractRecord, autonomousWorkers });
    } catch (barrierErr) {
      if (barrierErr.code === 'WORKER_BARRIER_NO_EVIDENCE' || barrierErr.code === 'WORKER_BARRIER_TIMEOUT') {
        emit(agentId, 'WORKER_EVIDENCE_BARRIER_EMPTY', 'BARRIER', 'Worker evidence barrier concluded without usable dossiers; proceeding to orchestrator supervision.', { error: barrierErr.message }, 'warning');
      } else {
        throw barrierErr;
      }
    }
  }

  assertMissionNotCancelled(agentId);
  return superviseMission({ db, agentId, normalizedMission, dispatchedAgent, contractRecord: ctx.contractRecord, executionRun, autonomyPlan: ctx.autonomyPlan, runtimeBudget: ctx.runtimeBudget, runtimeEnvironment: ctx.runtimeEnvironment, silentUpdates: ctx.silentUpdates, genosCapsule: ctx.genosCapsule, executable: ctx.executable });
}

function startMission(mission) {
  const agentId = mission.agentId || mission.id;
  if (!agentId) return Promise.reject(new Error('agentId is required'));
  if (activeProcesses.has(agentId) || missionStarts.has(agentId)) return Promise.resolve({ started: true, duplicate: true });
  const start = startMissionInternal(mission).finally(async () => {
    const cancelled = cancelledStarts.has(agentId) || activeWorkerBarriers.get(agentId)?.cancelled === true;
    missionStarts.delete(agentId);
    cancelledStarts.delete(agentId);
    if (!cancelled) {
      emit(agentId, 'WORKER_RECOVERY_DECISION', 'RECOVERY_DISPATCH', `Checking for queued worker recovery after runtime shutdown for ${agentId}.`, {
        agentId,
        reason: 'runtime shutdown completed; review queued worker recovery if any'
      }, 'info');
      try {
        await dispatchWorkerRecovery(agentId);
      } catch (err) {
        console.error('[AgentRuntimeAdapter] Error in dispatchWorkerRecovery for %s:', agentId, err);
      }
      try {
        dispatchPendingContinuation(agentId);
      } catch (err) {
        console.error('[AgentRuntimeAdapter] Error in dispatchPendingContinuation for %s:', agentId, err);
      }
    } else {
      pendingContinuations.delete(agentId);
      pendingWorkerRecoveries.delete(agentId);
    }
  });
  missionStarts.set(agentId, start);
  return start;
}

async function stopMission(agentId) {
  pendingContinuations.delete(agentId);
  pendingWorkerRecoveries.delete(agentId);
  autonomousRounds.delete(agentId);
  cancelledStarts.add(agentId);

  let barrierStopped = false;
  const barrier = activeWorkerBarriers.get(agentId);
  if (barrier) {
    barrier.cancelled = true;
    activeWorkerBarriers.delete(agentId);
    await Promise.all([...barrier.workerIds].map((workerId) => stopMission(workerId)));
    barrierStopped = true;
  }

  if (await stopMissionChildren(agentId, stopMission)) barrierStopped = true;

  const child = activeProcesses.get(agentId);
  if (child) {
    child.genosStopRequested = true;
    terminateChild(child);
    return true;
  }

  if (missionStarts.has(agentId)) {
    return true;
  }

  const runtime = await stopPersistedRuntime(agentId);
  if (runtime.handled) return runtime.killed;

  return barrierStopped;
}

function stopAllMissions() {
  const ids = new Set([
    ...activeProcesses.keys(),
    ...missionStarts.keys(),
    ...activeWorkerBarriers.keys(),
    ...pendingContinuations.keys(),
    ...pendingWorkerRecoveries.keys()
  ]);
  for (const agentId of ids) {
    cancelledStarts.add(agentId);
    pendingContinuations.delete(agentId);
    pendingWorkerRecoveries.delete(agentId);
    stopMission(agentId);
  }
  return [...ids];
}

async function reconcilePersistedRuntimes(db) {
  const rows = await db.all("SELECT id, status, runtime_pid, runtime_executable FROM agents WHERE status != 'terminated' AND runtime_pid IS NOT NULL");
  let reconciled = 0;
  for (const row of rows) {
    reconciled += await reconcilePersistedRuntimeRow(db, row);
  }

  reconciled += await reconcileDeadOrchestratorChildren(db);
  reconciled += await reconcileOrphanedRunning(db);

  return reconciled;
}

module.exports = {
  startMission,
  stopMission,
  stopAllMissions,
  reconcilePersistedRuntimes,
  configuredExecutable,
  bundledRuntimeEnvironment,
  runtimeAvailability,
  createIsolatedWorkspace,
  provisionMissionWorkspace,
  runtimeExitOutcome,
  evidenceScore: require('./agentEvidenceService').evidenceScore,
  workerToolLease: require('./agentOrchestrationState').workerToolLease,
  orchestratorToolLease: require('./agentOrchestrationState').orchestratorToolLease,
  rankLocalModels: require('./agentModelRoutingService').rankLocalModels,
  localCompetencyFloor: require('./agentModelRoutingService').localCompetencyFloor,
  competentLocalModels: require('./agentModelRoutingService').competentLocalModels,
  modelUsage: require('./agentModelRoutingService').modelUsage,
  autonomousRoundOutcome: require('./agentRoundService').autonomousRoundOutcome,
  buildWorkerSynthesisPrompt: require('./agentEvidenceService').buildWorkerSynthesisPrompt,
  waitForAutonomousWorkerQuiescence: require('./agentFleetService').waitForAutonomousWorkerQuiescence,
  attachMissionMemoryContext
};
