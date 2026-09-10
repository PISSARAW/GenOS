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
  reconcilePersistedRuntimeRow, reconcileDeadOrchestratorWorkers, reconcileOrphanedRunning
} = require('./agentRuntimeAdapter/missionReconcile');

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
  computeRuntimeBudget(ctx);
  await createMissionExecutionRun(ctx);
  reportOrchestratorStart(ctx);
  return ctx;
}

async function startMissionInternal(mission) {
  const ctx = await bootstrapMission(mission);
  const { agentId, normalizedMission, db, dispatchedAgent, executionRun } = ctx;
  console.log("adapter: localModel"); assertMissionNotCancelled(agentId);
  const inProcessWorker = isInProcessWorker(dispatchedAgent, normalizedMission, ctx.executable);
  if (inProcessWorker) {
    await trackWorkspace(agentId, normalizedMission.workspaceRoot);
    return runLocalWorker(db, normalizedMission, executionRun);
  }

  // The orchestrator creates and dispatches its own bounded worker fleet. A worker
  // never recurses here: authority is deliberately one-way.
  const autonomousWorkers = await orchestrateAutonomousWorkers(ctx);
  if (autonomousWorkers.length) {
    await runEvidenceBarrier({ db, agentId, normalizedMission, autonomyPlan: ctx.autonomyPlan, contractRecord: ctx.contractRecord, autonomousWorkers });
  }

  assertMissionNotCancelled(agentId);
  console.log("adapter: superviseMission"); return superviseMission({ db, agentId, normalizedMission, dispatchedAgent, contractRecord: ctx.contractRecord, executionRun, autonomyPlan: ctx.autonomyPlan, runtimeBudget: ctx.runtimeBudget, runtimeEnvironment: ctx.runtimeEnvironment, silentUpdates: ctx.silentUpdates, genosCapsule: ctx.genosCapsule, executable: ctx.executable });
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
        console.error(`[AgentRuntimeAdapter] Error in dispatchWorkerRecovery for ${agentId}:`, err);
      }
      try {
        dispatchPendingContinuation(agentId);
      } catch (err) {
        console.error(`[AgentRuntimeAdapter] Error in dispatchPendingContinuation for ${agentId}:`, err);
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

  reconciled += await reconcileDeadOrchestratorWorkers(db);
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
