const { activeProcesses, missionStarts, cancelledStarts, autonomousRounds, activeWorkerBarriers, pendingWorkerRecoveries, pendingContinuations, emit, updateAgent, orchestratorToolLease } = require('../agentOrchestrationState');
const { dispatchPendingContinuation } = require('../agentRoundService');
const { dispatchWorkerRecovery } = require('../agentRecoveryService');
const { provisionMissionWorkspace, createIsolatedWorkspace, trackWorkspace } = require('../agentWorkspaceLifecycleService');
const { runLocalWorker, runEvidenceBarrier } = require('../agentFleetService');
const { superviseMission, runtimeExitOutcome } = require('../agentProcessSupervisor');
const { bundledRuntimeEnvironment, configuredExecutable, runtimeAvailability, isLocalRuntime } = require('../agentRuntimeExecutable');
const { terminateChild } = require('../processTermination');
const {
  assertMissionNotCancelled, initializeMissionContext, resolveMissionContract, provisionWorkspaceAndModel,
  normalizeMissionBudgets, provisionMissionCapsule, enableMissionMonitoring
} = require('./missionBootstrap');
const {
  planMission, assertAutonomyPlanExecutable, applyExecutionPolicy, computeRuntimeBudget, incarnateOrchestrator, createMissionExecutionRun, reportOrchestratorStart
} = require('./missionPlanning');
const { orchestrateAutonomousWorkers } = require('./missionWorkers');
const { stopMissionChildren, stopPersistedRuntime } = require('./missionShutdown');
const {
  reconcilePersistedRuntimeRow, reconcileOrphanedRunning
} = require('./missionReconcile');
const leasePolicy = require('../toolLeasePolicy');
const agentAuthority = require('../agentAuthorityService');
const config = require('../../config/orchestratorConfig');

async function attachMissionMemoryContext(normalizedMission, agentId) {
  const agentMemoryContext = require('../agentMemoryContext');
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
    config.inProcessWorkers() ||
    normalizedMission.inProcessWorker === true
  )) || (normalizedMission.localModel && (normalizedMission.localRuntime === true || isLocalRuntime(executable)));
}

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

module.exports = { attachMissionMemoryContext, isInProcessWorker, enforceMissionToolLease };