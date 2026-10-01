const { buildAutonomyPlanForMission } = require('../agentAutonomyPlanService');
const strategyExecution = require('../strategyExecutionService');
const userProgress = require('../userProgressService');
const { orchestratorToolLease, emit } = require('../agentOrchestrationState');
const { validateBudgetCoherence } = require('../budgetCoherenceService');
const orchestratorBody = require('../orchestratorBodyService');
const missionMorphogenesis = require('./missionMorphogenesis');

async function planMission(ctx) {
  const { db, agentId, normalizedMission, dispatchedAgent, contractRecord } = ctx;
  await attachGlobalWorkspace(ctx);
  ctx.autonomyPlan = await buildAutonomyPlanForMission({ db, agentId, normalizedMission, dispatchedAgent, contractRecord });
  await attachMorphogenesisPlan(ctx);
}

async function attachMorphogenesisPlan(ctx) {
  if (!ctx.autonomyPlan || ctx.dispatchedAgent.execution_mode !== 'orchestrator') return;
  try {
    const { planMorphogenesis } = require('../morphogenesis/morphogenesisPlannerService');
    const input = missionMorphogenesis.buildMissionMorphogenesisInput(ctx);
    input.reason = 'mission_execution_plan';
    const plan = planMorphogenesis(input);
    ctx.morphogenesisPlan = plan;
    ctx.autonomyPlan.morphogenesisPlan = plan;
    await publishMorphogenesisCandidate(ctx, plan);
    if (shadowMorphogenesisEnabled()) await attachMorphogenesisShadow(ctx, plan);
  } catch (error) {
    ctx.morphogenesisPlan = null;
    emit(ctx.agentId, 'MORPHOGENESIS_MISSION_PLAN_FAILED', 'PLAN_MISSION', error.message, {
      code: error.code || 'MORPHOGENESIS_PLAN_FAILED'
    }, 'warning');
  }
}

async function publishMorphogenesisCandidate(ctx, plan) {
  if (require('../globalWorkspaceService').getMode() === 'off') return;
  const store = require('../adaptiveStateService').AdaptiveStateService;
  await new store(ctx.db).persistObject('agow_morphogenesis_plans', ctx.agentId, plan, Date.now());
  await require('../agow/candidates/candidateAdapterService').submit({
    db: ctx.db, agentId: ctx.agentId, module: 'morphogenesis', activeGoal: ctx.normalizedMission.missionId || 'mission',
    observation: {
      candidateId: `morphogenesis:${ctx.agentId}:${ctx.normalizedMission.missionId || 'mission'}`,
      semanticType: 'morphogenesis_plan', artifactRef: ctx.agentId,
      compactPreview: `Topology proposal: ${plan.selectedTopology || 'unselected'}`,
      evidenceRefs: Array.isArray(plan.evidenceRefs) ? plan.evidenceRefs : [],
      confidence: Number(plan.utility) || 0.5, evidenceCoverage: 0, goalMatched: true,
      causalEvidence: false, actionable: false, redundancyKey: `morphogenesis:${ctx.agentId}`
    }
  });
}

function shadowMorphogenesisEnabled() {
  return /^(1|true|on)$/i.test(String(process.env.GENOS_MORPHOGENESIS_V2_SHADOW || ''));
}

async function attachMorphogenesisShadow(ctx, plan) {
  const { runMorphogenesisShadow } = require('../morphogenesis/runtime/morphogenesisShadowAdapter');
  const result = await runMorphogenesisShadow(plan, { missionId: ctx.agentId });
  ctx.morphogenesisV2Shadow = result;
  ctx.autonomyPlan.morphogenesisV2Shadow = {
    decision: result.decision,
    committed: result.committed,
    authorityPending: result.authorityPending || null,
    errors: result.errors || result.evaluation?.typing?.errors || []
  };
  emit(ctx.agentId, 'MORPHOGENESIS_V2_SHADOW', 'SENSE_WORLD', 'Morphogenesis V2 evaluated a non-committing shadow proposal.', ctx.autonomyPlan.morphogenesisV2Shadow, 'info');
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

function applyValencePosture(ctx) {
  try {
    const drives = ctx.autonomyPlan?.valenceDrives?.drives;
    if (Array.isArray(drives)) require('../valenceService').applyValencePosture(ctx.normalizedMission, drives);
    const report = require('../allostaticPlanningService').applyMeasuredPosture(
      ctx.normalizedMission, ctx.autonomyPlan.valenceDrives
    );
    ctx.autonomyPlan.allostaticPlan = report;
    emit(ctx.agentId, 'ALLOSTATIC_PLAN_APPLIED', 'PLAN_MISSION',
      'Measured runtime state was evaluated and its posture was passed into mission execution policy.', {
        status: report.status,
        selectedActions: report.selectedActions,
        violations: report.violations,
        outcomePrediction: report.outcomePrediction
      }, report.status === 'measured' ? 'info' : 'warning');
  } catch (_) {}
}

async function attachGlobalWorkspace(ctx) {
  const task = ctx.normalizedMission.prompt || ctx.normalizedMission.currentTask || '';
  if (!task.trim()) return;
  const workspaceService = require('../globalWorkspaceService');
  const mode = workspaceService.getMode();
  if (mode !== 'off') {
    const agow = await attachAgowWorkspace({ ctx, task, workspaceService, mode });
    if (agow.controlsMission) return;
  }
  const state = workspaceService.compete([
    { id: `mission:${ctx.agentId}`, salience: 1, content: task }
  ], { capacity: 3, ignitionThreshold: 1, modules: ['planning', 'execution', 'reporting'] });
  const contents = new Map(state.admitted.map((item) => [item.id, item.content]));
  const consumers = {};
  for (const module of state.globalAccess) {
    consumers[module] = workspaceService.consume(state, module, (contentId) => contents.get(contentId) || null);
  }
  ctx.globalWorkspace = {
    contentId: state.winner?.id || null,
    ignited: state.ignited,
    consumers: Object.fromEntries(Object.entries(consumers).map(([module, result]) => [module, {
      available: result.available, consumed: result.consumed,
      contentId: result.contentId, content: result.output
    }]))
  };
  ctx.normalizedMission.globalWorkspace = ctx.globalWorkspace;
  emit(ctx.agentId, 'GLOBAL_WORKSPACE_CONSUMPTION', 'PLAN_MISSION',
    'Mission content was admitted and consumed by authorized downstream modules.', {
      contentId: ctx.globalWorkspace.contentId,
      ignited: ctx.globalWorkspace.ignited,
      consumers: Object.fromEntries(Object.entries(consumers).map(([module, result]) => [module, {
        available: result.available, consumed: result.consumed
      }]))
    }, 'info');
}

function buildMissionCandidate(options) {
  const { ctx, task, now } = options;
  const missionId = ctx.normalizedMission.missionId;
  return {
    candidateId: `mission:${ctx.agentId}:${now}`,
    agentId: ctx.agentId,
    source: { module: 'mission_planning', instanceId: missionId || null, modality: 'mission_text' },
    content: { semanticType: 'mission_request', artifactRef: null, compactPreview: task.slice(0, 2000) },
    evidenceRefs: [String(missionId || ctx.agentId)], causalParents: [],
    measures: { predictionError: 0, uncertainty: 0.1, goalRelevance: 1, expectedInformationGain: 0.5, urgency: 1, novelty: 0.5, actionability: 1, causalConfidence: 0.9, evidenceDebt: 0, estimatedCost: 0 },
    constraints: { safety: 'clear', integrity: 'clear', viability: 'clear', userPolicy: 'clear' },
    redundancyKey: null, producedAt: now, expiresAt: now + 300000,
    stateHash: require('node:crypto').createHash('sha256').update(task).digest('hex')
  };
}

async function attachAgowWorkspace(options) {
  const { ctx, task, workspaceService, mode } = options;
  const now = Date.now();
  const candidate = buildMissionCandidate({ ctx, task, now });
  const admission = await workspaceService.submitCandidate({ candidate, now, db: ctx.db, activeGoal: String(ctx.normalizedMission.missionId || 'mission') });
  const result = admission.cycle || null;
  const controlsMission = mode === 'bounded' && frameContains(result?.frame, candidate.candidateId);
  const activation = activationForMode({ mode, controlsMission });
  ctx.agow = { mode, activation, candidateId: candidate.candidateId, accepted: admission.accepted, frame: result?.frame || null, broadcast: result?.broadcast || null };
  if (!controlsMission) ctx.globalWorkspaceShadow = ctx.agow;
  else {
    ctx.globalWorkspace = { authority: 'agow', frameId: result?.frame?.frameId || null, cycle: result?.frame?.cycle || 0, available: Boolean(result?.frame), broadcast: result?.broadcast || null };
    ctx.normalizedMission.globalWorkspace = ctx.globalWorkspace;
  }
  return { controlsMission };
}

function activationForMode(mode) {
  if (mode.mode === 'live') return 'awaiting_causal_promotion';
  if (mode.controlsMission) return 'bounded';
  return mode.mode === 'bounded' ? 'shadow_waiting_for_ignition' : 'shadow';
}

function frameContains(frame, candidateId) {
  return Boolean(frame && (frame.primaryContent === candidateId || frame.secondaryContents?.includes(candidateId)));
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
  applyValencePosture(ctx);
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
  attachGlobalWorkspace,
  applyValencePosture,
  assertAutonomyPlanExecutable,
  applyExecutionPolicy,
  computeRuntimeBudget,
  incarnateOrchestrator,
  createMissionExecutionRun,
  reportOrchestratorStart
};
