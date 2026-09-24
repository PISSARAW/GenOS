const { activeProcesses, missionStarts, cancelledStarts, autonomousRounds, activeWorkerBarriers, pendingWorkerRecoveries, pendingContinuations, emit, updateAgent, orchestratorToolLease } = require('../agentOrchestrationState');
const { dispatchPendingContinuation } = require('../agentRoundService');

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
      taskId: normalizedMission.taskId,
      promptGenome: normalizedMission.promptGenome,
      promptRegulators: normalizedMission.promptRegulators,
      promptRegulatorState: normalizedMission.promptRegulatorState
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
  if (normalizedMission.executor === 'caller_mcp') return false;
  return (dispatchedAgent.execution_mode === 'worker' && (
    config.inProcessWorkers() ||
    normalizedMission.inProcessWorker === true
  )) || (normalizedMission.localModel && (normalizedMission.localRuntime === true || isLocalRuntime(executable)));
}

function requiredOf(contract) {
  if (Array.isArray(contract)) return contract;
  if (contract && Array.isArray(contract.required)) return contract.required;
  return [];
}

function directCaps(mission) {
  const direct = mission.capabilities || mission.capabilityContract;
  const req = requiredOf(direct);
  return req.length ? req : [];
}

function missionCapabilities(mission, plan) {
  const direct = directCaps(mission);
  if (direct.length) return direct;
  const contract = mission.capabilityContract || (plan && plan.capabilityContract);
  return requiredOf(contract);
}

function enforceMissionToolLease(ctx) {
  const dispatched = ctx.dispatchedAgent || {};
  const mission = ctx.normalizedMission || {};
  const role = mission.role || dispatched.role;
  const provided = mission.toolLease;
  const capabilities = missionCapabilities(mission, ctx.autonomyPlan);
  agentAuthority.assertToolLeaseFresh(
    { id: ctx.agentId, execution_mode: dispatched.execution_mode, role, capabilities, plan: ctx.autonomyPlan },
    provided,
    ctx.autonomyPlan
  );
  const policy = leasePolicy.derivePolicyLease({ executionMode: dispatched.execution_mode, role, plan: ctx.autonomyPlan, capabilities });
  const bounded = leasePolicy.restrictProvidedLease(provided, policy);
  mission.toolLease = mission.workerContract?.authority?.execute === false ? [] : bounded;
  ctx.normalizedMission = mission;
}

module.exports = { attachMissionMemoryContext, isInProcessWorker, enforceMissionToolLease };
