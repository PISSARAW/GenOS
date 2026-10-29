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
  mission = require('../gvxTrialMissionBinding').bindCampaignMission(mission);
  const ctx = await initializeMissionContext(mission);
  if (ctx.normalizedMission.gvxTrialContext) {
    await require('../gvxTrialExecutionAdapter').admit(ctx.db, ctx.normalizedMission);
  }
  await resolveMissionContract(ctx);
  await require('../workerCellBootstrapBridge').activate(ctx);
  await require('../garageAdmissionService').adopt(ctx);
  await require('../garageAdmissionService').provisionWorker(ctx);
  await provisionWorkspaceAndModel(ctx);
  await require('../missionHabitatRuntime').bindMissionHabitat(ctx);
  normalizeMissionBudgets(ctx);
  await enableMissionMonitoring(ctx);
  await planMission(ctx);
  assertAutonomyPlanExecutable(ctx);
  await require('./missionLease').attachMissionMemoryContext(ctx.normalizedMission, ctx.agentId, ctx.contractRecord);
  assertMissionNotCancelled(ctx.agentId);
  applyExecutionPolicy(ctx);
  await enforceMissionToolLease(ctx);
  computeRuntimeBudget(ctx);
  incarnateOrchestrator(ctx);
  await createMissionExecutionRun(ctx);
  await provisionMissionCapsule(ctx);
  await require('../garageRuntimeService').bindExecution(ctx);
  await require('../trinityQualificationDispatch').recordStarted(ctx);
  ctx.authorityExecutable = executionEntrypoint(ctx);
  await require('../missionEnvelopeAuthority').seal(ctx);
  await require('../orchestratorBodyAuthority').bind(ctx);
  reportOrchestratorStart(ctx);
  return ctx;
}

async function startMissionInternal(mission) {
  const ctx = await bootstrapMission(mission);
  const { agentId, normalizedMission, db, dispatchedAgent, executionRun } = ctx;
  assertMissionNotCancelled(agentId);
  await require('../missionEnvelopeAuthority').assertRun(db, { agentId, runId: executionRun.id,
    mission: normalizedMission, verifyInputs: true, executable: ctx.authorityExecutable });
  await require('../missionExecutionAuthority').assertAgentCurrent(db,agentId);
  await require('../missionExecutionAuthority').assertAuthority(db,normalizedMission.missionExecutionAuthority);
  await require('../garageRuntimeService').assertLease(db, normalizedMission);
  const deterministicWorker = require('../agents/workerRuntimeLimitsService')
    .isDeterministicWorkerMission(normalizedMission);
  require('../habitatEnforcementService').assertSupervisedProcess(ctx, deterministicWorker);
  if (deterministicWorker) {
    await trackWorkspace(agentId, normalizedMission.workspaceRoot);
    await require('../trinityRuntimeAttestation').recordInProcess(ctx,
      require.resolve('../agents/deterministicWorkerRuntime'), 'in-process-native');
    return require('../agents/deterministicWorkerRuntime').runDeterministicWorker(db, normalizedMission, executionRun);
  }
  const inProcessWorker = isInProcessWorker(dispatchedAgent, normalizedMission, ctx.executable);
  require('../habitatEnforcementService').assertSupervisedProcess(ctx, inProcessWorker);
  if (inProcessWorker) {
    await trackWorkspace(agentId, normalizedMission.workspaceRoot);
    await require('../trinityRuntimeAttestation').recordInProcess(ctx,
      require.resolve('../agentFleetService'), 'in-process-worker');
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
    require('../morphogenesis/morphogenesisMissionBinding').bindDispatchResults(
      ctx.autonomyPlan, autonomousWorkers, ctx.autonomyPlan.workerResults || []
    );
    await executeCompositeMorphology(ctx, agentId);
  }

  assertMissionNotCancelled(agentId);
  await require('../missionExecutionAuthority').assertAgentCurrent(db,agentId);
  await require('../missionExecutionAuthority').assertAuthority(db,normalizedMission.missionExecutionAuthority);
  return superviseMission({ db, agentId, normalizedMission, dispatchedAgent, contractRecord: ctx.contractRecord, executionRun, autonomyPlan: ctx.autonomyPlan, runtimeBudget: ctx.runtimeBudget, runtimeEnvironment: ctx.runtimeEnvironment, silentUpdates: ctx.silentUpdates, genosCapsule: ctx.genosCapsule, executable: ctx.executable,
    habitat: ctx.habitat });
}

function executionEntrypoint(ctx) {
  if (require('../agents/workerRuntimeLimitsService').isDeterministicWorkerMission(ctx.normalizedMission)) {
    return require.resolve('../agents/deterministicWorkerRuntime');
  }
  if (isInProcessWorker(ctx.dispatchedAgent, ctx.normalizedMission, ctx.executable)) {
    return require.resolve('../agentFleetService');
  }
  return ctx.executable;
}

async function executeCompositeMorphology(ctx, agentId) {
  const morphology = await require('../morphogenesis/missionMorphologyExecution')
    .executeCompositeMorphology(ctx);
  if (!morphology.executed) return;
  require('../agentOrchestrationState').emit(agentId, 'MORPHOGENESIS_COMPOSITE_EXECUTED',
    'SYNTHESIZE_MORPHOLOGY', 'Executed the composed MorphologyGraph over verified worker results.',
    { graphId: morphology.graphId, graphVersion: morphology.graphVersion }, 'info');
}

async function finalizeMissionStart(agentId) {
  const { cancelledStarts, activeWorkerBarriers, missionStarts } = require('../agentOrchestrationState');
  const cancelled = cancelledStarts.has(agentId) || activeWorkerBarriers.get(agentId)?.cancelled === true;
  missionStarts.delete(agentId);
  require('./missionStartIdentityState').missionStartIdentities.delete(agentId);
  try { await require('../garageRuntimeService').finalizeAgent(agentId); }
  catch (failure) { console.error('[GarageFabric] Runtime finalization failed:', failure.message); }
  try { await require('../agentRoundService').resumeMorphogenesisBarrierForWorker(agentId); }
  catch (failure) { console.error('[Morphogenesis] Could not resume a quiescent worker round:', failure.message); }
  cancelledStarts.delete(agentId);
  await handlePostShutdown(agentId, cancelled);
}

const MAX_IDLE_POST_SHUTDOWN_CHECKS = 5;
const POST_SHUTDOWN_CHECK_BASE_DELAY_MS = 1000;
const postShutdownObservations = new Map();

function postShutdownBackoffDelayMs(idleChecks) {
  return Math.min(30000, POST_SHUTDOWN_CHECK_BASE_DELAY_MS * (2 ** Math.max(0, idleChecks - 1)));
}

function observationState(agentId) {
  const state = postShutdownObservations.get(agentId) || { idleChecks: 0, lastCheckAt: 0, closed: false };
  postShutdownObservations.set(agentId, state);
  return state;
}

function resetPostShutdownObservation(agentId) {
  postShutdownObservations.delete(agentId);
}

function observeIdlePostShutdown(agentId, emit) {
  const state = observationState(agentId);
  if (state.closed) return 'closed';
  const now = Date.now();
  if (now - state.lastCheckAt < postShutdownBackoffDelayMs(state.idleChecks + 1)) return 'throttled';
  state.lastCheckAt = now;
  state.idleChecks += 1;
  if (state.idleChecks >= MAX_IDLE_POST_SHUTDOWN_CHECKS) {
    state.closed = true;
    emit(agentId, 'WORKER_RECOVERY_OBSERVATION_CLOSED', 'RECOVERY_OBSERVATION', `Post-shutdown recovery observation for ${agentId} closed after ${state.idleChecks} idle checks without queued work.`, { agentId, idleChecks: state.idleChecks }, 'info');
    return 'closed';
  }
  return 'observed';
}

async function handlePostShutdown(agentId, cancelled) {
  const { pendingWorkerRecoveries, pendingContinuations, emit } = require('../agentOrchestrationState');
  if (cancelled) {
    pendingContinuations.delete(agentId);
    pendingWorkerRecoveries.delete(agentId);
    resetPostShutdownObservation(agentId);
    return;
  }
  if (!pendingWorkerRecoveries.has(agentId) && !pendingContinuations.has(agentId)) {
    observeIdlePostShutdown(agentId, emit);
    return;
  }
  resetPostShutdownObservation(agentId);
  emit(agentId, 'WORKER_RECOVERY_DECISION', 'RECOVERY_DISPATCH', `Checking for queued worker recovery after runtime shutdown for ${agentId}.`, {
    agentId,
    reason: 'runtime shutdown completed; review queued worker recovery if any'
  }, 'info');
  try {
    await require('../agentRecoveryService').dispatchWorkerRecovery(agentId);
  } catch (err) {
    console.error('[AgentRuntimeAdapter] Error in dispatchWorkerRecovery.', { agentId, error: err });
  }
  try {
    require('../agentRoundService').dispatchPendingContinuation(agentId);
  } catch (err) {
    console.error('[AgentRuntimeAdapter] Error in dispatchPendingContinuation.', { agentId, error: err });
  }
}

function startMission(mission) {
  const agentId = mission.agentId || mission.id;
  if (!agentId) return Promise.reject(new Error('agentId is required'));
  const state = require('../agentOrchestrationState');
  const identities = require('./missionStartIdentityState').missionStartIdentities;
  const identity = require('./missionStartIdentity');
  let fingerprint;
  try { fingerprint = identity.missionStartFingerprint(mission); }
  catch (error) { return Promise.reject(error); }
  if (state.activeProcesses.has(agentId) || state.missionStarts.has(agentId)) {
    const existingStart = state.missionStarts.get(agentId);
    if (identities.get(agentId) === fingerprint && existingStart) return existingStart;
    return Promise.reject(identity.activeMissionConflict(agentId));
  }
  identities.set(agentId, fingerprint);
  const start = Promise.resolve().then(() => startMissionInternal(mission))
    .finally(() => finalizeMissionStart(agentId)).catch(async (failure) => {
    await recordMissionStartFailure(agentId, failure);
    throw failure;
  });
  state.missionStarts.set(agentId, start);
  return start;
}

function missionStartFailureDetail(failure) {
  const code = String(failure?.code || 'AGENT_MISSION_START_FAILED');
  const message = String(failure?.message || failure || 'Unknown mission start failure.');
  return `${code}: ${message}`.slice(0, 4000);
}

async function recordMissionStartFailure(agentId, failure) {
  const detail = missionStartFailureDetail(failure);
  try {
    const db = await require('../../db').getDatabase();
    await db.run("UPDATE agents SET status = 'error', current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      detail, agentId);
  } catch (recordingFailure) {
    console.error('[AgentRuntimeAdapter] Mission start failure could not be persisted.', {
      agentId, error: recordingFailure.message
    });
  }
  require('../agentOrchestrationState').emit(agentId, 'AGENT_MISSION_START_FAILED', 'START_RUNTIME', detail, {
    code: failure?.code || 'AGENT_MISSION_START_FAILED'
  }, 'error');
}

module.exports = { startMissionInternal, startMission, missionStartFailureDetail, finalizeMissionStart, handlePostShutdown, observeIdlePostShutdown, resetPostShutdownObservation, postShutdownBackoffDelayMs, MAX_IDLE_POST_SHUTDOWN_CHECKS, postShutdownObservations };
