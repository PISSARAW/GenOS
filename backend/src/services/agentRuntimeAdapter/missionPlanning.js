const { buildAutonomyPlanForMission } = require('../agentAutonomyPlanService');
const strategyExecution = require('../strategyExecutionService');
const userProgress = require('../userProgressService');
const { orchestratorToolLease } = require('../agentOrchestrationState');
const { validateBudgetCoherence } = require('../budgetCoherenceService');

async function planMission(ctx) {
  const { db, agentId, normalizedMission, dispatchedAgent, contractRecord } = ctx;
  ctx.autonomyPlan = await buildAutonomyPlanForMission({ db, agentId, normalizedMission, dispatchedAgent, contractRecord });
}

function assertAutonomyPlanExecutable(ctx) {
  const { autonomyPlan, dispatchedAgent, normalizedMission } = ctx;
  if (dispatchedAgent.execution_mode !== 'orchestrator') return;
  if (normalizedMission.autonomousOrchestration === false) return;
  if (!autonomyPlan || autonomyPlan.executionStatus !== 'blocked') return;
  const blocker = (autonomyPlan.executionBlockers || [])[0] || {};
  const message = blocker.message || 'Autonomy plan is blocked and cannot start a runtime execution.';
  throw Object.assign(new Error(message), { code: blocker.code || 'AUTONOMY_PLAN_BLOCKED', autonomyPlan, remediation: autonomyPlan.remediation || null });
}

function applyOrchestratorToolLease(dispatchedAgent, normalizedMission, autonomyPlan) {
  if (dispatchedAgent.execution_mode === 'orchestrator' && !normalizedMission.toolLease?.length) {
    normalizedMission.toolLease = orchestratorToolLease(autonomyPlan || {});
  }
}

function applyExecutionPolicy(ctx) {
  const { normalizedMission, dispatchedAgent } = ctx;
  const task = normalizedMission.prompt || normalizedMission.currentTask || '';
  const silentUpdates = userProgress.silenceRequested(
    task,
    normalizedMission.silentUpdates === true || normalizedMission.executionPolicy?.silentUpdates === true
  );
  normalizedMission.executionPolicy = {
    allowedCommands: Array.isArray(normalizedMission.executionPolicy?.allowedCommands)
      ? [...new Set(normalizedMission.executionPolicy.allowedCommands.map((value) => String(value).trim()).filter(Boolean))]
      : [],
    allowFileEdits: normalizedMission.executionPolicy?.allowFileEdits === true,
    silentUpdates
  };
  normalizedMission.userReporting = userProgress.reportingPolicy(task, silentUpdates);
  applyOrchestratorToolLease(dispatchedAgent, normalizedMission, ctx.autonomyPlan);
  ctx.silentUpdates = silentUpdates;
}

function computeRuntimeBudget(ctx) {
  const { autonomyPlan, normalizedRuntimeBudget, dispatchedAgent } = ctx;
  const runtimeBudget = autonomyPlan
    ? {
      ...normalizedRuntimeBudget,
      tokens: Math.max(1, Math.floor(autonomyPlan.tokenPolicy.total * autonomyPlan.tokenPolicy.orchestratorReserve))
    }
    : normalizedRuntimeBudget;
  const budgetCheck = validateBudgetCoherence({
    executionBudget: { ...runtimeBudget, scope: dispatchedAgent.execution_mode || 'orchestrator' },
    autonomyPlan: autonomyPlan || { tokenPolicy: { total: runtimeBudget.tokens, workerShare: runtimeBudget.workerShare || 0.6, orchestratorReserve: runtimeBudget.orchestratorReserve || 0.4 } },
    scope: dispatchedAgent.execution_mode || 'orchestrator'
  });
  if (!budgetCheck.valid) {
    throw Object.assign(new Error(`Runtime budget coherence check failed: ${budgetCheck.reason}`), { code: 'BUDGET_COHERENCE_FAILURE' });
  }
  ctx.runtimeBudget = runtimeBudget;
}

async function createMissionExecutionRun(ctx) {
  const { db, agentId, runtimeBudget, contractRecord } = ctx;
  ctx.executionRun = await strategyExecution.createExecutionRun(db, {
    agentId,
    budget: runtimeBudget,
    contractRecord
  });
}

function reportOrchestratorStart(ctx) {
  const { dispatchedAgent, agentId, contractRecord, silentUpdates } = ctx;
  if (dispatchedAgent.execution_mode === 'orchestrator') {
    userProgress.report({
      orchestratorId: agentId,
      sourceAgentId: agentId,
      phase: 'started',
      message: `Mission started. The orchestrator selected '${contractRecord.primaryStrategy}' and is organizing the work.`,
      next: ['decompose the mission', 'collect worker evidence', 'verify the result'],
      silent: silentUpdates
    });
  }
}

module.exports = {
  planMission,
  assertAutonomyPlanExecutable,
  applyExecutionPolicy,
  computeRuntimeBudget,
  createMissionExecutionRun,
  reportOrchestratorStart
};
