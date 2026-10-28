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
const { assertMissionPromptBudget } = require('./missionPromptBudget');
const obligations = require('./missionObligationContext');
const missionMemoryContext = require('./missionMemoryContext');

function applyPromptBudget(mission, prompt) {
  const estimate = assertMissionPromptBudget(mission, prompt);
  if (estimate) mission.contextTokenEstimate = estimate;
  return prompt;
}

function memoryOptions(mission, bounded, context) {
  return {
    organizationId: mission.organizationId,
    projectId: mission.projectId,
    sessionId: mission.sessionId,
    taskId: mission.taskId,
    missionScope: mission.missionScope,
    obligationContext: context,
    recallPhase: mission.recallPhase,
    situationalRecall: mission.situationalRecall,
    historicalMemoryTokenBudget: mission.historicalMemoryTokenBudget,
    memoryContextTokenBudget: mission.memoryContextTokenBudget,
    promptGenome: mission.promptGenome,
    promptRegulators: mission.promptRegulators,
    promptRegulatorState: mission.promptRegulatorState,
    peekVesicles: bounded
  };
}

async function appendMemoryContext(input) {
  const { mission, agentId, task, mandatory, context } = input;
  const bounded = mission.contextTokenBudget !== undefined && mission.contextTokenBudget !== null;
  const memory = require('../agentMemoryContext');
  const query = obligations.queryFor(task, context);
  const memoryPrompt = await memory.formatCognitiveMemoryPrompt(agentId, query,
    { ...memoryOptions(mission, bounded, context), scopeTask: task });
  const hasMemory = Boolean(memoryPrompt && memoryPrompt.trim());
  const prompt = hasMemory ? `${mandatory}\n\nGENOS MEMORY CONTEXT\n${memoryPrompt}` : mandatory;
  try {
    applyPromptBudget(mission, prompt);
  } catch (error) {
    if (!context || error.code !== 'GENOS_CONTEXT_BUDGET_EXCEEDED') throw error;
    mission.memoryContext = missionMemoryContext.createMemoryContext(
      'omitted_budget', '', 'optional_memory_exceeds_context_budget');
    mission.memoryContextAttached = false;
    mission.memoryContextDegradation = 'optional_memory_exceeds_context_budget';
    mission.prompt = mandatory;
    return;
  }
  mission.prompt = mandatory;
  if (hasMemory) {
    mission.memoryContext = missionMemoryContext.createMemoryContext('attached', memoryPrompt);
    mission.memoryContextAttached = true;
    mission.prompt = prompt;
    return;
  }
  mission.memoryContext = missionMemoryContext.createMemoryContext('empty');
  mission.memoryContextAttached = false;
}

function isBudgetError(error) {
  return error.code === 'GENOS_CONTEXT_BUDGET_INVALID'
    || error.code === 'GENOS_CONTEXT_BUDGET_EXCEEDED';
}

function skipMissionMemoryLookup(mission, task, context) {
  if (!task.trim()) return true;
  if (mission.useMemoryContext !== false && context?.open.length !== 0) return false;
  mission.memoryContext = missionMemoryContext.createMemoryContext('disabled', '',
    mission.useMemoryContext === false ? 'mission_disabled_memory' : 'no_open_obligations');
  return true;
}

async function attachMissionMemoryContext(normalizedMission, agentId, contractRecord) {
  const task = normalizedMission.prompt || normalizedMission.currentTask || '';
  const context = obligations.fromContract(contractRecord, normalizedMission);
  const brief = obligations.briefFor(context);
  const mandatory = brief ? `${task}\n\n${brief}` : task;
  normalizedMission.memoryContext = missionMemoryContext.createMemoryContext('empty');
  normalizedMission.memoryContextAttached = false;
  applyPromptBudget(normalizedMission, mandatory);
  if (brief) normalizedMission.prompt = mandatory;
  if (skipMissionMemoryLookup(normalizedMission, task, context)) return normalizedMission;
  try {
    await appendMemoryContext({ mission: normalizedMission, agentId, task, mandatory, context });
  } catch (error) {
    if (isBudgetError(error)) throw error;
    normalizedMission.memoryContext = missionMemoryContext.createMemoryContext('empty', '', 'memory_lookup_failed');
    normalizedMission.memoryContextAttached = false;
    normalizedMission.memoryContextError = error.message;
  }
  return normalizedMission;
}

function isInProcessWorker(dispatchedAgent, normalizedMission, executable) {
  if (normalizedMission.executor === 'caller_mcp') return false;
  if (normalizedMission.continuousExecution?.mode === 'control'
    || normalizedMission.continuousExecution?.mode === 'observe') return false;
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

async function enforceMissionToolLease(ctx) {
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
  mission.toolLease = require('../agents/workerContractLeaseService').restrict(mission.workerContract, bounded);
  if (mission.executor === 'caller_mcp') {
    const contexts = require('../hostExecutionContext');
    mission.hostExecutionContext = contexts.bindHostToolLease(mission.hostExecutionContext, mission.toolLease);
  }
  ctx.normalizedMission = mission;
  await applyFocusProbe(ctx, mission);
  return applyPolicyMasking(ctx, mission);
}

async function applyFocusProbe(ctx, mission) {
  try {
    const probes = require('../attentionProbeService');
    const probe = await probes.consumeFocusConstraint(ctx.db, ctx.agentId);
    if (!probe) return;
    const narrowed = mission.toolLease.filter((tool) => probe.allowedTools.includes(tool));
    mission.toolLease = narrowed;
  } catch (_) {}
}

async function applyPolicyMasking(ctx, mission) {
  try {
    const masking = require('../policyMaskingService');
    const result = await masking.maskLease(ctx.db, mission.toolLease, {});
    mission.toolLease = result.lease;
    if (result.masked.length) mission.policyMask = { masked: result.masked, reason: result.reason };
  } catch (_) {}
}

module.exports = { attachMissionMemoryContext, isInProcessWorker, enforceMissionToolLease, applyFocusProbe };
