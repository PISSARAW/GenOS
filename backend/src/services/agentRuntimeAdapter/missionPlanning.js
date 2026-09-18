const { buildAutonomyPlanForMission } = require('../agentAutonomyPlanService');
const strategyExecution = require('../strategyExecutionService');
const userProgress = require('../userProgressService');
const { orchestratorToolLease, emit } = require('../agentOrchestrationState');
const { validateBudgetCoherence } = require('../budgetCoherenceService');
const orchestratorBody = require('../orchestratorBodyService');

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

function applyFanoutCorrection(mission, signal) {
  if (!signal) return;
  const factor = Number((1 - signal.strength).toFixed(3));
  const workers = Number(mission.executionPolicy.requestedWorkers || mission.workerCount || 0);
  mission.executionPolicy.workerFanoutFactor = factor;
  mission.executionPolicy.workerFanoutLimit = Math.floor(workers * factor);
}

function applyDelayCorrection(mission, signal) {
  if (!signal) return;
  const delayMs = Math.max(1000, Math.round(signal.strength * 10000));
  mission.executionPolicy.nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
}

function applyDiagnosticCorrection(mission, signal) {
  if (signal && signal.target === 'diagnostics') mission.executionPolicy.diagnosticsPriority = signal.strength;
}

function applyRegulatedPosture(normalizedMission, arbitration) {
  if (!arbitration) return;
  const corrections = Array.isArray(arbitration.selectedCorrections) ? arbitration.selectedCorrections : [];
  applyFanoutCorrection(normalizedMission, corrections.find((signal) => signal.target === 'worker_fanout' && signal.direction === 'inhibit'));
  applyDelayCorrection(normalizedMission, corrections.find((signal) => signal.direction === 'delay'));
  applyDiagnosticCorrection(normalizedMission, corrections.find((signal) => signal.direction === 'amplify'));
  if (corrections.some((signal) => signal.target === 'action_plan' && signal.direction === 'block')) {
    normalizedMission.autonomousOrchestration = false;
  }
  if (arbitration.actionMode === 'probe') {
    normalizedMission.executionPolicy.allowFileEdits = false;
    normalizedMission.requiresEvidenceBeforePromotion = true;
  }
  normalizedMission.executionPolicy.actionMode = arbitration.actionMode;
  normalizedMission.executionPolicy.humanReviewRequired = arbitration.humanReviewRequired;
}

function applyExecutionPolicy(ctx) {
  const { normalizedMission, dispatchedAgent } = ctx;
  const arbitration = ctx.autonomyPlan?.controlRegulation?.arbitration;
  const task = normalizedMission.prompt || normalizedMission.currentTask || '';
  const requestedWorkers = Number(normalizedMission.executionPolicy?.requestedWorkers || normalizedMission.workerCount || 0);
  const silentUpdates = userProgress.silenceRequested(
    task,
    normalizedMission.silentUpdates === true || normalizedMission.executionPolicy?.silentUpdates === true
  );
  normalizedMission.executionPolicy = {
    allowedCommands: Array.isArray(normalizedMission.executionPolicy?.allowedCommands)
      ? [...new Set(normalizedMission.executionPolicy.allowedCommands.map((value) => String(value).trim()).filter(Boolean))]
      : [],
    allowFileEdits: normalizedMission.executionPolicy?.allowFileEdits === true,
    requestedWorkers: Number.isFinite(requestedWorkers) && requestedWorkers > 0 ? requestedWorkers : 0,
    silentUpdates
  };
  applyRegulatedPosture(normalizedMission, arbitration);
  normalizedMission.userReporting = userProgress.reportingPolicy(task, silentUpdates);
  applyOrchestratorToolLease(dispatchedAgent, normalizedMission, ctx.autonomyPlan);
  ctx.silentUpdates = silentUpdates;
}

function computeRuntimeBudget(ctx) {
  const { autonomyPlan, normalizedRuntimeBudget, dispatchedAgent } = ctx;
  const runtimeBudget = autonomyPlan
    ? {
      ...normalizedRuntimeBudget,
      tokens: Math.max(0, Math.floor(autonomyPlan.tokenPolicy.total * autonomyPlan.tokenPolicy.orchestratorReserve))
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

function applyBodyActions(ctx) {
  const body = ctx.orchestratorBody;
  const reflexIds = new Set(body.reflexes.map((reflex) => reflex.id));
  const survivalActions = new Set(body.survival?.actions || []);
  body.actions = [];
  if (reflexIds.has('block_destructive_actuator')) {
    throw Object.assign(new Error('Orchestrator body froze mission startup because a destructive actuator was leased.'), { code: 'ORCHESTRATOR_BODY_FREEZE', orchestratorBody: body });
  }
  if (reflexIds.has('budget_conservation')) {
    ctx.normalizedMission.autonomousOrchestration = false;
    body.actions.push({ actuator: 'SafetyActuator', action: 'network_silence', effect: 'worker dispatch disabled before runtime supervision' });
  }
  if (reflexIds.has('evidence_debt_gate')) {
    ctx.normalizedMission.requiresEvidenceBeforePromotion = true;
    body.actions.push({ actuator: 'MemoryActuator', action: 'require_proof', effect: 'promotion requires typed evidence receipts' });
  }
  if (reflexIds.has('immune_challenge')) {
    ctx.normalizedMission.requiresEvidenceBeforePromotion = true;
    body.actions.push({ actuator: 'SafetyActuator', action: 'quarantine', effect: 'promotion blocked pending independent evidence' });
  }
  if (reflexIds.has('cryptobiosis_suspend')) {
    ctx.normalizedMission.autonomousOrchestration = false;
    ctx.normalizedMission.survivalStatus = 'dormant';
    body.actions.push({ actuator: 'MemoryActuator', action: 'snapshot_and_suspend', effect: 'worker dispatch suspended; wake condition required' });
  }
  if (survivalActions.has('repair_boundary')) body.actions.push({ actuator: 'StrategyActuator', action: 'plan_causal_repair', effect: 'repair requires restore and validation evidence' });
  if (survivalActions.has('reproduce_strategy')) body.actions.push({ actuator: 'MemoryActuator', action: 'request_strategy_distillation', effect: 'inheritance remains gated by evidence receipt' });
}

function incarnateOrchestrator(ctx) {
  if (ctx.dispatchedAgent.execution_mode !== 'orchestrator') return;
  ctx.orchestratorBody = orchestratorBody.buildOrchestratorBody(ctx);
  applyBodyActions(ctx);
  ctx.normalizedMission.orchestratorBody = ctx.orchestratorBody;
  emit(ctx.agentId, 'ORCHESTRATOR_BODY_STATE', 'SENSE_WORLD', 'The orchestrator built a typed body state before acting.', ctx.orchestratorBody, 'info');
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
  incarnateOrchestrator,
  createMissionExecutionRun,
  reportOrchestratorStart
};
