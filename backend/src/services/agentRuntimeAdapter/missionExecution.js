const { runLocalWorker, runEvidenceBarrier } = require('../agentFleetService');
const { superviseMission } = require('../agentProcessSupervisor');
const { orchestrateAutonomousWorkers } = require('./missionWorkers');
const { enforceMissionToolLease, isInProcessWorker } = require('./missionLease');
const {
  assertMissionNotCancelled,
  initializeMissionContext,
  resolveMissionContract,
  provisionWorkspaceAndModel,
  normalizeMissionBudgets,
  provisionMissionCapsule,
  enableMissionMonitoring,
} = require('./missionBootstrap');
const {
  planMission,
  assertAutonomyPlanExecutable,
  incarnateOrchestrator,
  applyExecutionPolicy,
  computeRuntimeBudget,
  createMissionExecutionRun,
  reportOrchestratorStart,
} = require('./missionPlanning');
const { trackWorkspace } = require('../agentWorkspaceLifecycleService');

/**
 * Reconstruit le contexte de mission complet (bootstrapMission refactoré).
 * Enchaîne : initialize → contract → workspace → budgets → capsule → monitoring → planning.
 */
async function bootstrapMission(mission) {
  const ctx = await initializeMissionContext(mission);
  await resolveMissionContract(ctx);
  await provisionWorkspaceAndModel(ctx);
  normalizeMissionBudgets(ctx);
  await provisionMissionCapsule(ctx);
  await enableMissionMonitoring(ctx);
  await planMission(ctx);
  assertAutonomyPlanExecutable(ctx);
  incarnateOrchestrator(ctx);
  await require('./missionLease').attachMissionMemoryContext(ctx.normalizedMission, ctx.agentId);
  assertMissionNotCancelled(ctx.agentId);
  applyExecutionPolicy(ctx);
  enforceMissionToolLease(ctx);
  computeRuntimeBudget(ctx);
  await createMissionExecutionRun(ctx);
  reportOrchestratorStart(ctx);
  return ctx;
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

  const autonomousWorkers = await orchestrateAutonomousWorkers(ctx);
  if (autonomousWorkers.length) {
    try {
      await runEvidenceBarrier({ db, agentId, normalizedMission, autonomyPlan: ctx.autonomyPlan, contractRecord: ctx.contractRecord, autonomousWorkers, strict: true });
    } catch (barrierErr) {
      if (barrierErr.code === 'WORKER_BARRIER_NO_EVIDENCE' || barrierErr.code === 'WORKER_BARRIER_TIMEOUT') {
        const { emit } = require('../agentOrchestrationState');
        emit(agentId, 'WORKER_EVIDENCE_BARRIER_BLOCKED', 'BARRIER', 'Worker evidence barrier produced no usable dossiers; orchestrator supervision is blocked.', {
          error: barrierErr.message,
          barrierCode: barrierErr.code,
          requestedWorkers: ctx.autonomyPlan?.workers?.length || 0,
          selectedWorkers: ctx.autonomyPlan?.dispatchWorkers?.length || 0,
          createdWorkers: autonomousWorkers.length,
          verifiedWorkers: 0
        }, 'critical');
        throw Object.assign(new Error(`Worker evidence barrier blocked mission startup: ${barrierErr.message}`), {
          code: 'WORKER_EVIDENCE_BARRIER_BLOCKED',
          cause: barrierErr
        });
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
  const { activeProcesses, missionStarts, cancelledStarts, activeWorkerBarriers, pendingWorkerRecoveries, pendingContinuations, emit } = require('../agentOrchestrationState');
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
        await require('../agentRecoveryService').dispatchWorkerRecovery(agentId);
      } catch (err) {
        console.error(`[AgentRuntimeAdapter] Error in dispatchWorkerRecovery for ${agentId}:`, err);
      }
      try {
        require('../agentRoundService').dispatchPendingContinuation(agentId);
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

module.exports = { startMissionInternal, startMission };
