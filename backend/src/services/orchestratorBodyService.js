const { evaluateSurvival } = require('./survivalModelService');

const SENSOR_SOURCES = Object.freeze({
  ideVision: 'ide_vision',
  filesystemTouch: 'filesystem_touch',
  terminalHearing: 'terminal_hearing',
  proprioception: 'proprioception',
  spatialMemory: 'spatial_memory',
  socialPerception: 'social_perception',
  webPerception: 'web_perception',
  temporalPerception: 'temporal_perception'
});

const DESTRUCTIVE_TOOLS = new Set([
  'genos_orchestrate', 'genos_delete', 'genos_reset', 'genos_force_push',
  'git_reset_hard', 'git_clean', 'shell_unbounded'
]);

const ACTUATORS = Object.freeze({
  FileActuator: { preconditions: ['workspaceRoot'], cost: 0.04, risk: 0.25, permissions: ['workspace:read', 'workspace:write'], expectedEvidence: ['diff', 'hash'], rollback: true },
  TerminalActuator: { preconditions: ['allowedCommands'], cost: 0.12, risk: 0.35, permissions: ['command:run'], expectedEvidence: ['exit_code', 'stdout'], rollback: false },
  WorkerActuator: { preconditions: ['tokenBudget', 'toolLease'], cost: 0.22, risk: 0.45, permissions: ['agent:create'], expectedEvidence: ['worker_dossier'], rollback: true },
  StrategyActuator: { preconditions: ['strategyContract'], cost: 0.08, risk: 0.2, permissions: ['strategy:update'], expectedEvidence: ['decision_record'], rollback: true },
  MemoryActuator: { preconditions: ['missionId'], cost: 0.03, risk: 0.12, permissions: ['memory:write'], expectedEvidence: ['memory_receipt'], rollback: false },
  BrowserActuator: { preconditions: ['url'], cost: 0.16, risk: 0.38, permissions: ['browser:inspect'], expectedEvidence: ['dom_or_screenshot'], rollback: false },
  GitActuator: { preconditions: ['workspaceRoot'], cost: 0.1, risk: 0.5, permissions: ['git:diff'], expectedEvidence: ['git_diff'], rollback: true },
  SafetyActuator: { preconditions: ['threat_or_debt'], cost: 0.05, risk: 0.08, permissions: ['mission:guard'], expectedEvidence: ['guard_event'], rollback: true }
});

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function numberOr(value, fallback) {
  const resolved = Number(value);
  return Number.isFinite(resolved) ? resolved : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function createPercept(input) {
  return {
    kind: input.kind,
    source: input.source,
    value: input.value || {},
    confidence: clamp01(numberOr(input.confidence, 1)),
    cost: Math.max(0, numberOr(input.cost, 0)),
    timestamp: input.timestamp || new Date().toISOString()
  };
}

function bodyInputs(ctx) {
  const mission = ctx.normalizedMission || {};
  const plan = ctx.autonomyPlan || {};
  const budget = ctx.runtimeBudget || ctx.normalizedRuntimeBudget || mission.executionBudget || {};
  return { ctx, mission, plan, budget };
}

function missionIntentPercept(input) {
  const mission = input.mission;
  return createPercept({ kind: 'mission_intent', source: SENSOR_SOURCES.ideVision, value: { promptPresent: Boolean(mission.prompt || mission.currentTask), goalCount: list(mission.openGoals).length }, cost: 0.01 });
}

function filesystemPercept(input) {
  return createPercept({ kind: 'filesystem_state', source: SENSOR_SOURCES.filesystemTouch, value: { workspaceRoot: input.mission.workspaceRoot || null, capsule: input.ctx.genosCapsule || null }, cost: 0.02 });
}

function terminalPercept(input) {
  const policy = input.mission.executionPolicy || {};
  return createPercept({ kind: 'terminal_state', source: SENSOR_SOURCES.terminalHearing, value: { executable: input.ctx.executable || null, allowedCommands: list(policy.allowedCommands) }, cost: 0.02 });
}

function budgetPercept(input) {
  const budget = input.budget;
  const policy = input.plan.tokenPolicy || {};
  return createPercept({ kind: 'metabolic_budget', source: SENSOR_SOURCES.proprioception, value: { tokens: numberOr(budget.tokens, 0), workerShare: numberOr(budget.workerShare, policy.workerShare || 0), orchestratorReserve: numberOr(budget.orchestratorReserve, policy.orchestratorReserve || 0) }, cost: 0.01 });
}

function spatialMemoryPercept(input) {
  const mission = input.mission;
  return createPercept({ kind: 'spatial_memory', source: SENSOR_SOURCES.spatialMemory, value: { workspaceId: mission.workspaceId || null, organizationId: mission.organizationId || null, projectId: mission.projectId || null }, cost: 0.01 });
}

function socialPercept(input) {
  const plan = input.plan;
  const workers = list(plan.dispatchWorkers || plan.workers);
  return createPercept({ kind: 'social_state', source: SENSOR_SOURCES.socialPerception, value: { activeWorkers: workers.length, organization: plan.organization || null, disagreements: numberOr(plan.disagreements, 0) }, cost: 0.03 });
}

function toolLeasePercept(input) {
  return createPercept({ kind: 'tool_lease', source: SENSOR_SOURCES.proprioception, value: { tools: list(input.mission.toolLease) }, cost: 0.01 });
}

function evidencePercept(input) {
  const mission = input.mission;
  return createPercept({ kind: 'evidence_state', source: SENSOR_SOURCES.socialPerception, value: { debt: list(mission.evidenceDebt), recentFailures: numberOr(mission.recentFailures, 0) }, cost: 0.02 });
}

function temporalPercept(input) {
  return createPercept({ kind: 'temporal_state', source: SENSOR_SOURCES.temporalPerception, value: { timeoutMs: numberOr(input.budget.timeoutMs, 0), startedAt: input.ctx.startedAt || null }, cost: 0.01 });
}

function collectMissionPercepts(ctx) {
  const input = bodyInputs(ctx);
  return [
    missionIntentPercept(input),
    filesystemPercept(input),
    terminalPercept(input),
    budgetPercept(input),
    spatialMemoryPercept(input),
    socialPercept(input),
    toolLeasePercept(input),
    evidencePercept(input),
    temporalPercept(input)
  ];
}

function valueFor(percepts, kind) {
  const found = percepts.find((percept) => percept.kind === kind);
  return found ? found.value : {};
}

function buildWorldState(percepts) {
  const budget = valueFor(percepts, 'metabolic_budget');
  const social = valueFor(percepts, 'social_state');
  const evidence = valueFor(percepts, 'evidence_state');
  const lease = valueFor(percepts, 'tool_lease');
  const tokens = numberOr(budget.tokens, 0);
  const recentFailures = numberOr(evidence.recentFailures, 0);
  const evidenceDebt = list(evidence.debt);
  const budgetPressure = tokens <= 0 ? 1 : clamp01(1 - (tokens / 12000));
  const failurePressure = clamp01(recentFailures / 3);
  const uncertainty = evidenceDebt.length > 0 || recentFailures > 0;
  return {
    budget: tokens,
    stress: clamp01((budgetPressure * 0.45) + (failurePressure * 0.35) + (uncertainty ? 0.2 : 0)),
    uncertain: uncertainty,
    threat: list(lease.tools).some((tool) => DESTRUCTIVE_TOOLS.has(tool)),
    activeWorkers: numberOr(social.activeWorkers, 0),
    recentFailures,
    availableTools: list(lease.tools),
    openGoals: list(valueFor(percepts, 'mission_intent').openGoals),
    evidenceDebt
  };
}

function reflexesFor(worldState) {
  const reflexes = [];
  if (worldState.threat) {
    reflexes.push({ id: 'block_destructive_actuator', action: 'freeze', reason: 'Tool lease contains a destructive or recursive actuator.', actuator: 'SafetyActuator' });
  }
  if (worldState.budget > 0 && worldState.budget < 1200) {
    reflexes.push({ id: 'budget_conservation', action: 'network_silence', reason: 'ATP budget is below the worker dispatch threshold.', actuator: 'SafetyActuator' });
  }
  if (worldState.recentFailures >= 2) {
    reflexes.push({ id: 'failure_inflammation', action: 'replay_or_escalate', reason: 'Repeated failures raised inflammation above the adaptation threshold.', actuator: 'StrategyActuator' });
  }
  if (worldState.evidenceDebt.length) {
    reflexes.push({ id: 'evidence_debt_gate', action: 'require_proof', reason: 'Promotion is blocked until evidence debt is paid.', actuator: 'MemoryActuator' });
  }
  return reflexes;
}

function survivalReflexes(survival) {
  const actions = new Set(survival.actions);
  const reflexes = [];
  if (actions.has('conserve_energy')) reflexes.push({ id: 'homeostasis_guard', action: 'constrain_plan', reason: 'Low energy requires bounded fan-out and low-cost tools.', actuator: 'SafetyActuator' });
  if (actions.has('quarantine')) reflexes.push({ id: 'immune_challenge', action: 'quarantine_and_require_evidence', reason: 'Threat or toxicity requires independent evidence.', actuator: 'SafetyActuator' });
  if (actions.has('hibernate')) reflexes.push({ id: 'cryptobiosis_suspend', action: 'snapshot_and_suspend', reason: 'Critical energy or habitat loss requires dormancy.', actuator: 'MemoryActuator' });
  if (actions.has('repair_boundary')) reflexes.push({ id: 'regeneration_plan', action: 'isolate_restore_validate', reason: 'Integrity damage requires causal repair.', actuator: 'StrategyActuator' });
  if (actions.has('reproduce_strategy')) reflexes.push({ id: 'validated_strategy_reproduction', action: 'distill_validated_trait', reason: 'Independent evidence permits bounded inheritance.', actuator: 'MemoryActuator' });
  return reflexes;
}

function buildOrchestratorBody(ctx) {
  const percepts = collectMissionPercepts(ctx || {});
  const worldState = buildWorldState(percepts);
  const survival = evaluateSurvival({
    ...worldState,
    uncertainty: worldState.uncertain ? 1 : 0,
    ...(ctx.normalizedMission?.survivalState || {})
  });
  return {
    loop: ['perceive', 'interpret', 'decide', 'act', 'sense_consequences', 'learn'],
    percepts,
    worldState,
    survival,
    actuators: ACTUATORS,
    reflexes: [...reflexesFor(worldState), ...survivalReflexes(survival)]
  };
}

module.exports = {
  SENSOR_SOURCES,
  ACTUATORS,
  collectMissionPercepts,
  buildWorldState,
  reflexesFor,
  survivalReflexes,
  buildOrchestratorBody
};