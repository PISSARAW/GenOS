/**
 * Local-model worker execution: bounded generation with immune chaperone.
 */
const modelRouter = require('./modelRouter');
const localCodeWorker = require('./localCodeWorkerService');
const strategyExecution = require('./strategyExecutionService');
const { decideFromEvent } = require('./orchestrationDecisionService');
const actionExecutor = require('./orchestrationActionExecutor');
const { emit, updateAgent } = require('./agentOrchestrationState');
const agentIdentity = require('./agentIdentityService');
const agentConscience = require('./agentConscienceService');
const immuneSystem = require('./immuneSystem');
const workerIdentity = require('./identity/worker');
const { advanceAutonomousRound } = require('./agentRoundService');
const agentRecoveryService = require('./agentRecoveryService');
const { scheduleWorkspaceCleanup } = require('./agentWorkspaceLifecycleService');
const localEvidenceArtifact = require('./workerEvidenceLocalArtifact');
const localEvidencePrompt = require('./workerEvidenceLocalPrompt');
const { estimatePromptTokens, resolveTokenBudget, throwIfPromptOverBudget,
  resolveMaxOutputTokens, consumedTokensOf, throwIfConsumedOverBudget } = require('./workerEvidenceBarrierLocalBudget');
const emitCodeTestReceipt = require('./workerCodeTestReceipt');
const workerCodeTestRepair = require('./workerCodeTestRepair');
const workerCodeTestRepairTelemetry = require('./workerCodeTestRepairTelemetry');
const { reportMilestone } = require('./workerEvidenceBarrierLocalEvents');
const proposalExecution = require('./workerEvidenceBarrierLocalProposal');
function resolveAgentName(mission) {
  if (mission.name) return mission.name;
  return 'GenOS Worker';
}
function resolveNameMeaning(mission, agentName) {
  if (mission.nameMeaning) return mission.nameMeaning;
  const found = agentIdentity.findIdentityByName(agentName);
  if (!found) return 'Spécialiste autonome';
  if (found.meaning) return found.meaning;
  return 'Spécialiste autonome';
}
function resolveWorkerModel(mission) {
  if (mission.localModel) return mission.localModel;
  if (mission.model) return mission.model;
  return process.env.GENOS_LOCAL_MODEL || process.env.OLLAMA_MODEL || 'llama3.1:8b';
}
function isOrchestratorMission(mission) {
  const mode = mission.executionMode ?? mission.execution_mode;
  if (mode === 'orchestrator') return true;
  if (mode === 'worker') return false;
  return mission.role === 'Autonomous Orchestrator' && !mission.workerKind;
}
function resolveMaxCost(mission) {
  if (!mission.executionBudget) return undefined;
  const value = Number(mission.executionBudget.costUsd);
  if (Number.isFinite(value)) return value;
  return undefined;
}
async function generateWorkerResult(ctx) {
  if (!ctx.executionRun?.id) {
    throw Object.assign(new Error('Local worker generation requires its execution run.'), {
      code: 'WORKER_EXECUTION_RUN_REQUIRED'
    });
  }
  const startedAt = Date.now();
  const hasParentBudget = Boolean(ctx.mission.modelBudgetScope)
    || (ctx.mission.orchestratorAgentId && ctx.mission.orchestratorAgentId !== ctx.mission.agentId);
  const sharedBudget = hasParentBudget
    ? await require('./missionModelBudgetScope').routeBudget(ctx.mission, ctx.db) : {};
  try { return await modelRouter.generate({
    db: ctx.db,
    cognitiveIntegration: 'worker',
    agentId: ctx.mission.agentId,
    executionRunId: ctx.executionRun.id,
    identitySession: ctx.identitySession,
    model: ctx.workerModel,
    timeoutMs: ctx.latencyMs,
    priority: 'bulk',
    maxTokens: ctx.maxTokens,
    maxCostUsd: ctx.maxCost,
    seed: Number.isInteger(ctx.mission.identityExperimentSeed) ? ctx.mission.identityExperimentSeed : undefined,
    ...sharedBudget,
    responseFormat: ctx.codeWorker
      ? localCodeWorker.proposalResponseFormat({
        allowedCommands: ctx.mission.executionPolicy?.allowedCommands,
        allowedPatchPaths: ctx.mission.allowedPatchPaths,
        requiredPatchPaths: ctx.mission.requiredPatchPaths,
        requiredPatchMarkers: ctx.mission.requiredPatchMarkers,
        requiredPatchMinimumBytes: ctx.mission.requiredPatchMinimumBytes,
        forceFullFileReplacement: ctx.mission.forceFullFileReplacement === true
      })
      : require('./workerEvidenceIdentityPrompt').workerResponseFormat(ctx.mission),
    reasoningEffort: ctx.codeWorker && /^ollama:\/\//i.test(String(ctx.workerModel || '')) ? 'none' : undefined,

    policy: ctx.policy,
    prompt: ctx.promptText
  }); } finally { ctx.stageTimings.modelRouteMs = Date.now() - startedAt; }
}
function resolveImmuneReport(ctx) {
  return immuneSystem.phagocytoseCodexReport(String(ctx.text), {
    agentName: ctx.agentName,
    nameMeaning: ctx.nameMeaning,
    role: ctx.role
  });
}
function throwIfImmuneRejected(report, outputText) {
  if (report.ok) return;
  const message = report.error;
  let detail = 'Local worker did not return a repairable evidence report.';
  if (message) detail = message;
  const text = String(outputText || '');
  const reason = text.trim() ? 'response.unrepairable_json' : 'response.absent';
  throw Object.assign(new Error(detail), { code: 'IMMUNE_OUTPUT_REJECTED', painSignal: report.painSignal, workerArtifactDiagnostics: { issues: [reason], outputExcerpt: text.slice(0, 2048) } });
}
function attachProposalTests(evidenceReport, proposal) {
  if (!proposal) return;
  if (!proposal.tests) return;
  if (proposal.tests.length === 0) return;
  evidenceReport.tests = proposal.tests;
}
function resolveNoAnswerProof(evidenceReport) {
  const recovery = require('./workerFailureRecoveryService');
  return recovery.proofOfNoAnswer(evidenceReport);
}
function isNoAnswerReport(evidenceReport, proof) {
  if (evidenceReport.outcome !== 'no_answer') return false;
  if (!proof) return false;
  return true;
}
function assertClaimsHaveEvidence(evidenceReport) {
  const monitoring = require('./hallucinationMonitoringService');
  if (Array.isArray(evidenceReport.claims) === false) {
    throw new Error('Local worker evidence report requires a claims array.');
  }
  for (const claim of evidenceReport.claims) {
    if (!claim) throw new Error('Local worker evidence report contains claims without evidence.');
    const material = claim.evidence;
    let receipts = claim.receipts;
    if (!receipts) receipts = claim.sourceRefs;
    let present = monitoring.evidencePresent(material);
    if (present === false) present = monitoring.evidencePresent(receipts);
    if (present) continue;
    throw new Error('Local worker evidence report contains claims without evidence.');
  }
}
function resolvePolicy(mission, workerModel) {
  if (mission.localRoutingPolicy) return mission.localRoutingPolicy;
  return { primary: workerModel, preferLocal: true };
}
function resolveLatency(mission) {
  const budget = Number(mission.executionBudget?.latencyMs);
  const missionTimeout = Number(mission.timeoutMs);
  const configured = Number.isFinite(budget) && budget > 0 ? budget : missionTimeout;
  return Number.isFinite(configured) && configured > 0 ? Math.min(configured, 900000) : 30000;
}
async function emitLocalStarted(ctx) {
  const started = emit(ctx.mission.agentId, 'LOCAL_WORKER_STARTED', 'LOCAL_MODEL', 'Started local-model worker.', { model: ctx.localModel, criteria: ctx.criteria }, 'info', 'running');
  await strategyExecution.recordExecutionEvent(ctx.db, ctx.mission.agentId, started);
  return started;
}
function maybeEmitDecisionBlocked(mission, event) {
  const evidence = require('./agentEvidenceService');
  if (evidence.hasDecisionEvidence(event)) return null;
  let ownerId = mission.agentId;
  if (mission.orchestratorAgentId) ownerId = mission.orchestratorAgentId;
  emit(ownerId, 'ORCHESTRATION_DECISION_BLOCKED', 'EVIDENCE_GATE', evidence.decisionEvidenceFailure(event), {
    sourceAgentId: mission.agentId, sourceEvent: event.eventType
  }, 'warning', 'blocked');
  return null;
}
async function maybeExecuteDecision(mission, event) {
  const evidence = require('./agentEvidenceService');
  if (evidence.hasDecisionEvidence(event) === false) return;
  const decision = decideFromEvent(event);
  if (!decision) return;
  let ownerId = mission.agentId;
  if (mission.orchestratorAgentId) ownerId = mission.orchestratorAgentId;
  let gateId = null;
  if (decision.gateId) gateId = decision.gateId;
  emit(ownerId, 'ORCHESTRATION_DECISION_GATE', decision.action, decision.reason, { gateId: gateId, sourceAgentId: mission.agentId, sourceEvent: event.eventType }, 'info');
  return actionExecutor.execute({ orchestratorId: ownerId, sourceAgentId: mission.agentId,
    decision: decision, event: event, workspaceRoot: mission.workspaceRoot }).catch(() => undefined);
}
async function publishLocalSuccess(ctx) {
  const { recordWorkerEvidence } = require('./agentEvidenceService');
  const progress = await strategyExecution.recordExecutionEvent(ctx.db, ctx.mission.agentId, ctx.event);
  if (progress?.halt) throw Object.assign(new Error(progress.reason), { code: 'WORKER_EXECUTION_HALTED',
    terminalReceiptPublished: Boolean(progress.biologicalReceipt) });
  maybeEmitDecisionBlocked(ctx.mission, ctx.event);
  const action = await maybeExecuteDecision(ctx.mission, ctx.event);
  if (action?.executed && action.result?.proof) ctx.event.payload.replayReceipt = action.result.proof;
  recordWorkerEvidence(ctx.mission, ctx.event);
  reportMilestone(ctx.mission, ctx.event);
  await advanceAutonomousRound(ctx.mission, ctx.event);
  await scheduleWorkspaceCleanup(ctx.mission.agentId);
  require('./agentDnaInnovation').captureFromSuccess({ db: ctx.db, mission: ctx.mission, event: ctx.event }).catch(() => undefined);
}
async function runGenerationStage(ctx) {
  const promptStartedAt = Date.now();
  const codeWorker = localEvidencePrompt.isCodeWorkerMission(ctx.mission);
  const estimate = estimatePromptTokens(ctx.mission.prompt);
  const budget = resolveTokenBudget(ctx.mission);
  throwIfPromptOverBudget(estimate, budget);
  const agentName = resolveAgentName(ctx.mission);
  const nameMeaning = resolveNameMeaning(ctx.mission, agentName);
  let selfIntro = agentIdentity.formatSelfIntroduction(agentName, nameMeaning, ctx.mission.role);
  const conscienceState = await agentConscience.loadConscienceState(ctx.db, ctx.mission.agentId);
  let conscienceBlock = agentConscience.formatConsciencePrompt(conscienceState);
  const workerModel = resolveWorkerModel(ctx.mission);
  let wsBlock = ctx.identity.prompt;
  let identityExperimentAudit = null;
  const experimentArm = ctx.mission.identityExperimentArm;
  if (experimentArm) {
    const treatment = require('./identityExperimentPromptTreatment').applyIdentityExperimentTreatment({
      arm: experimentArm, agentId: ctx.mission.agentId, agentName, role: ctx.mission.role,
      selfIntro, conscienceBlock, workerSelfBlock: wsBlock
    });
    selfIntro = treatment.selfIntro;
    conscienceBlock = treatment.conscienceBlock;
    wsBlock = treatment.workerSelfBlock;
    identityExperimentAudit = treatment.audit;
  }
  const workerKinds = require('./agents/workerKindService');
  const kind = workerKinds.resolveWorkerKind(ctx.mission.workerKind, ctx.mission.role);
  const workerContract = ctx.mission.workerContract || workerKinds.buildWorkerContract(kind, {
    prompt: ctx.mission.prompt, scope: ctx.mission.workspaceRoot,
    orchestratorAgentId: ctx.mission.orchestratorAgentId,
    specialtyNiche: ctx.mission.specialtyNiche,
    methodContract: ctx.mission.methodContract,
    workerAssignment: ctx.mission.workerAssignment
  });
  const workspaceDetails = require('./workerEvidenceBarrierLocalValues1.js').runGenerationStageValue1({ codeWorker, get ctx() { return ctx; }, require });
  if (codeWorker) ctx.mission.allowedPatchPaths = workspaceDetails.patchCandidatePaths
    .filter((candidate) => localCodeWorker.safePath(candidate));
  const workspaceContext = codeWorker ? workspaceDetails.text : require('./workerEvidenceReadOnlyWorkspace').buildReadOnlyWorkspaceContext(ctx.mission);
  const promptText = localEvidencePrompt.buildAnalysisPrompt(require('./workerEvidenceBarrierLocalValues1.js').runGenerationStageValue4({ Boolean, JSON, agentName, codeWorker, get conscienceBlock() { return conscienceBlock; }, get ctx() { return ctx; }, experimentArm, isOrchestratorMission, kind, require, get selfIntro() { return selfIntro; }, workerContract, workerKinds, workspaceContext, get wsBlock() { return wsBlock; } }));
  if (identityExperimentAudit) {
    const event = emit(ctx.mission.agentId, 'IDENTITY_EXPERIMENT_PROMPT', 'PROMPT_TREATMENT',
      `Applied identity experiment arm ${identityExperimentAudit.arm}.`, require('./workerEvidenceBarrierLocalValues1.js').runGenerationStageValue3({ Number, get ctx() { return ctx; }, get identityExperimentAudit() { return identityExperimentAudit; }, promptText, require }), 'info', 'running');
    await strategyExecution.recordExecutionEvent(ctx.db, ctx.mission.agentId, event);
  }
  ctx.stageTimings.promptPreparationMs = Date.now() - promptStartedAt;
  const generationContext = {
    db: ctx.db,
    mission: ctx.mission,
    executionRun: ctx.executionRun,
    workerModel: workerModel,
    latencyMs: resolveLatency(ctx.mission),
    maxTokens: resolveMaxOutputTokens(budget, promptText, require('./workerEvidenceBarrierLocalValues1.js').runGenerationStageValue2({ get ctx() { return ctx; }, undefined })),
    maxCost: resolveMaxCost(ctx.mission),
    policy: resolvePolicy(ctx.mission, workerModel),
    stageTimings: ctx.stageTimings,
    codeWorker: codeWorker,
    promptText: promptText,
    identitySession: ctx.identity.session
  };
  let result = await require('./workerEvidenceSchemaRepair').generateWithSchemaRepair({ promptText,
    generate: (repairedPrompt) => generateWorkerResult({ ...generationContext, promptText: repairedPrompt }) });
  result = require('./morphogenesis/biomeAllocationRecovery').normalizeGenerationResult(result, ctx.mission);
  const codeRepairPlans = ctx.mission.codeRepairPlans || ctx.mission.codeRepairPlan;
  require('./workerEvidenceBarrierLocalStages1.js').runGenerationStageStage2({ codeRepairPlans, codeWorker, get result() { return result; }, set result(__genosNextStageValue) { result = __genosNextStageValue; }, workerCodeTestRepair });
  if (result.schemaViolation) throw Object.assign(new Error('Model output did not satisfy the requested worker evidence schema.'),
    { code: 'WORKER_OUTPUT_SCHEMA_VIOLATION', workerArtifactDiagnostics: result.schemaViolation });
  const schemaFailure = require('./workerEvidenceBarrierLocalSchemaFailure').fromModelResult(result);
  if (schemaFailure) throw schemaFailure;
  return { codeWorker: codeWorker, estimate: estimate, budget: budget, agentName: agentName, nameMeaning: nameMeaning, workerModel: workerModel, result: result };
}

async function assertEvidenceAuthority(db, mission, executionRun) {
  await require('./missionEnvelopeAuthority').assertRun(db, {
    agentId: mission.agentId,
    runId: executionRun.id,
    mission
  });
}
async function runEvidenceStage(ctx) {
  const consumed = consumedTokensOf(ctx.result);
  throwIfConsumedOverBudget(consumed, ctx.budget);
  await assertEvidenceAuthority(ctx.db, ctx.mission, ctx.executionRun);
  const proposal = await proposalExecution.resolveProposal({ codeWorker: ctx.codeWorker, result: ctx.result,
    workspaceRoot: ctx.mission.workspaceRoot, text: ctx.result.text,
    allowedCommands: ctx.mission.executionPolicy?.allowedCommands || [],
    requiredPatchPaths: ctx.mission.requiredPatchPaths,
    allowedPatchPaths: ctx.mission.allowedPatchPaths,
    requiredPatchMarkers: ctx.mission.requiredPatchMarkers,
    requiredPatchMinimumBytes: ctx.mission.requiredPatchMinimumBytes,
    db: ctx.db, mission: ctx.mission, executionRun: ctx.executionRun });
  if (ctx.codeWorker) emitCodeTestReceipt(ctx.mission, proposal, emit);
  require('./workerEvidenceBarrierLocalTestFailure').throwIfFailed(proposal, ctx.result, consumed);
  let evidenceReport = ctx.codeWorker
    ? require('./workerCodeEvidenceReport').build({ mission: ctx.mission, proposal })
    : await evidenceReportFromModel(ctx);
  attachProposalTests(evidenceReport, proposal);
  if (!ctx.codeWorker) localEvidenceArtifact.attachFullText(evidenceReport, ctx.result);
  if (!ctx.codeWorker) evidenceReport = require('./morphogenesis/biomeAllocationRecovery')
    .applyExhaustedRecovery(evidenceReport, ctx.mission, ctx.result.text);
  { const __genosStageResult1 = require('./workerEvidenceBarrierLocalStages1.js').runEvidenceStageStage1({ consumed, get ctx() { return ctx; }, set ctx(__genosNextStageValue) { ctx = __genosNextStageValue; }, get evidenceReport() { return evidenceReport; }, set evidenceReport(__genosNextStageValue) { evidenceReport = __genosNextStageValue; }, proposal }); if (__genosStageResult1) return __genosStageResult1.value; }
  const validationStartedAt = Date.now();
  try { localEvidenceArtifact.attachWorkerArtifact(evidenceReport, { ...ctx, proposal }); }
  finally { ctx.stageTimings.artifactValidationMs = Date.now() - validationStartedAt; }
  const allocationValidation = require('./morphogenesisRolePrompt').validateBiomeAllocation(
    evidenceReport.claims?.[0]?.statement, ctx.mission.prompt,
    { ...ctx.mission, ...(ctx.mission.workerAssignment || {}) });
  require('./workerEvidenceBarrierLocalStages1.js').runEvidenceStageStage3({ allocationValidation, get evidenceReport() { return evidenceReport; }, set evidenceReport(__genosNextStageValue) { evidenceReport = __genosNextStageValue; }, require });
  const proof = resolveNoAnswerProof(evidenceReport);
  const noAnswer = isNoAnswerReport(evidenceReport, proof);
  if (noAnswer === false) assertClaimsHaveEvidence(evidenceReport);
  return { consumed: consumed, proposal: proposal, evidenceReport: evidenceReport,
    proof: proof, noAnswer: noAnswer, unresolved: false };
}
async function evidenceReportFromModel(ctx) {
  const startedAt = Date.now();
  try {
    const immuneReport = resolveImmuneReport({ text: ctx.result.text, agentName: ctx.agentName,
      nameMeaning: ctx.nameMeaning, role: ctx.mission.role });
    throwIfImmuneRejected(immuneReport, ctx.result.text);
    return immuneReport.report;
  } finally { ctx.stageTimings.responseParsingMs = Date.now() - startedAt; }
}
async function runLocalWorker(db, mission, executionRun) {
  try { await require('./missionEnvelopeAuthority').assertRun(db, { agentId: mission.agentId, runId: executionRun.id, mission }); } catch (_) {}
  await updateAgent(mission.agentId, 'running', mission.prompt);
  await emitLocalStarted({ db: db, mission: mission, localModel: mission.localModel, criteria: mission.localRoutingCriteria });
  const stageTimings = {};
  let identity;
  let identityLeaseHeartbeat;
  let generation;
  try {
    identity = await workerIdentity.begin(db, { mission, executionRun });
    identityLeaseHeartbeat = require('./identity/leaseHeartbeat').start({ renew: () => workerIdentity.renew(db, identity), intervalMs: 60000 });
    await identityLeaseHeartbeat.pulse();
    const attempt = await workerCodeTestRepair.run({
      mission,
      runAttempt: async (currentMission) => {
        generation = await runGenerationStage({ db, mission: currentMission, executionRun, stageTimings, identity });
        identityLeaseHeartbeat.assertHealthy();
        const evidence = await runEvidenceStage({ db, executionRun, result: generation.result, budget: generation.budget,
          codeWorker: generation.codeWorker, mission: currentMission, agentName: generation.agentName,
          nameMeaning: generation.nameMeaning, stageTimings });
        identityLeaseHeartbeat.assertHealthy();
        return { generation, evidence };
      },
      onRetry: (retry) => workerCodeTestRepairTelemetry.publish({ db, mission, ...retry })
    });
    identityLeaseHeartbeat.assertHealthy();
    generation = attempt.generation;
    return await require('./workerEvidenceBarrierLocalCompletion').complete({ db, mission,
      executionRun, generation, evidence: attempt.evidence, identity, stageTimings }, publishLocalSuccess);
  } catch (error) {
    await identityLeaseHeartbeat?.stop();
    await workerIdentity.fail(db, { identity, executionRun, error });
    const usage = generation?.result ? {
      input_tokens: generation.result.inputTokens, output_tokens: generation.result.outputTokens,
      cost_usd: generation.result.costUsd, tokens: consumedTokensOf(generation.result)
    } : undefined;
    return await require('./workerEvidenceBarrierLocalFailure').publish({ db, mission, executionRun,
      error, usage, stageTimings, reportMilestone });
  } finally {
    await identityLeaseHeartbeat?.stop();
    await workerIdentity.release(db, identity);
  }
} module.exports = { runLocalWorker, generateWorkerResult, assertEvidenceAuthority, isOrchestratorMission };
