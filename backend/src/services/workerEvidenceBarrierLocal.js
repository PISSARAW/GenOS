/**
 * Local-model worker execution: bounded generation with immune chaperone.
 */
const modelRouter = require('./modelRouter');
const localCodeWorker = require('./localCodeWorkerService');
const strategyExecution = require('./strategyExecutionService');
const { decideFromEvent } = require('./orchestrationDecisionService');
const actionExecutor = require('./orchestrationActionExecutor');
const userProgress = require('./userProgressService');
const { emit, updateAgent } = require('./agentOrchestrationState');
const agentIdentity = require('./agentIdentityService');
const agentConscience = require('./agentConscienceService');
const immuneSystem = require('./immuneSystem');
const { advanceAutonomousRound } = require('./agentRoundService');
const { queueWorkerRecovery } = require('./agentRecoveryService');
const { scheduleWorkspaceCleanup } = require('./agentWorkspaceLifecycleService');

function isCodeWorkerRole(role) {
  if (!role) return false;
  if (/implementation|coder|developer/i.test(role)) return true;
  return false;
}

function isCodeWorkerMission(mission) {
  if (process.env.GENOS_ALLOW_LOCAL_CODE_WORKERS !== '1') return false;
  return isCodeWorkerRole(mission.role);
}

function estimatePromptTokens(prompt) {
  return Math.ceil(Buffer.byteLength(String(prompt), 'utf8') / 4);
}

function resolveTokenBudget(mission) {
  if (!mission) return 0;
  if (!mission.executionBudget) return 0;
  return Number(mission.executionBudget.tokens);
}

function promptBudgetError(estimate, budget) {
  return Object.assign(new Error('Local worker prompt consumes its token budget before generation (' + String(estimate) + ' >= ' + String(budget) + ').'), { code: 'BUDGET_EXHAUSTED' });
}

function throwIfPromptOverBudget(estimate, budget) {
  if (budget <= 0) return;
  if (estimate < budget) return;
  throw promptBudgetError(estimate, budget);
}

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
  if (mission.role === 'Autonomous Orchestrator') return true;
  if (mission.executionMode === 'orchestrator') return true;
  if (mission.execution_mode === 'orchestrator') return true;
  if (/orchestrator/i.test(mission.agentId)) return true;
  return false;
}

function buildAnalysisPrompt(ctx) {
  if (ctx.codeWorker) return ctx.selfIntro + '\n' + ctx.conscienceBlock + '\nYou are a bounded GenOS local code worker (' + ctx.agentName + '). Return only strict JSON. Branch mission:\n' + ctx.prompt;
  if (ctx.orchestrator) return ctx.selfIntro + '\n' + ctx.conscienceBlock + '\nYou are a GenOS orchestrator (' + ctx.agentName + '). Mission:\n' + ctx.prompt;
  return ctx.selfIntro + '\n' + ctx.conscienceBlock + '\nYou are a bounded GenOS local worker (' + ctx.agentName + '). Analyse this assigned branch. Branch mission:\n' + ctx.prompt;
}

function resolveMaxTokens(budget, estimate) {
  if (budget <= 0) return undefined;
  return budget - estimate;
}

function resolveMaxCost(mission) {
  if (!mission.executionBudget) return undefined;
  const value = Number(mission.executionBudget.costUsd);
  if (Number.isFinite(value)) return value;
  return undefined;
}

async function generateWorkerResult(ctx) {
  return modelRouter.generate({
    db: ctx.db,
    agentId: ctx.mission.agentId,
    model: ctx.workerModel,
    timeoutMs: ctx.latencyMs,
    priority: 'bulk',
    maxTokens: ctx.maxTokens,
    maxCostUsd: ctx.maxCost,
    policy: ctx.policy,
    prompt: ctx.promptText
  });
}

function consumedTokensOf(result) {
  return Number(result.inputTokens) + Number(result.outputTokens);
}

function throwIfConsumedOverBudget(consumed, budget) {
  if (budget <= 0) return;
  if (consumed <= budget) return;
  throw Object.assign(new Error('Local worker consumed ' + String(consumed) + ' tokens above its ' + String(budget) + '-token budget.'), { code: 'BUDGET_EXHAUSTED' });
}

async function resolveProposal(ctx) {
  if (!ctx.codeWorker) return null;
  return localCodeWorker.executeProposal({ workspaceRoot: ctx.workspaceRoot, text: ctx.text });
}

function throwIfProposalFailed(proposal) {
  if (!proposal) return;
  if (proposal.testStatus !== 'failed') return;
  throw Object.assign(new Error('Local code worker tests failed; capsule changes were rolled back.'), { code: 'WORKER_TESTS_FAILED', proposal: proposal });
}

function resolveImmuneReport(ctx) {
  return immuneSystem.phagocytoseCodexReport(String(ctx.text), {
    agentName: ctx.agentName,
    nameMeaning: ctx.nameMeaning,
    role: ctx.role
  });
}

function throwIfImmuneRejected(report) {
  if (report.ok) return;
  const message = report.error;
  let detail = 'Local worker did not return a repairable evidence report.';
  if (message) detail = message;
  throw Object.assign(new Error(detail), { code: 'IMMUNE_OUTPUT_REJECTED', painSignal: report.painSignal });
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
  if (!mission.executionBudget) return 30000;
  if (mission.executionBudget.latencyMs === undefined) return 30000;
  if (mission.executionBudget.latencyMs === null) return 30000;
  return Number(mission.executionBudget.latencyMs);
}

async function emitLocalStarted(ctx) {
  const started = emit(ctx.mission.agentId, 'LOCAL_WORKER_STARTED', 'LOCAL_MODEL', 'Started local-model worker.', { model: ctx.localModel, criteria: ctx.criteria }, 'info', 'running');
  await strategyExecution.recordExecutionEvent(ctx.db, ctx.mission.agentId, started);
  return started;
}

function reportMilestone(mission, event) {
  const milestone = userProgress.milestoneFromEvent(event, { agentId: mission.agentId, agentName: mission.name, task: mission.prompt });
  if (!milestone) return;
  let silent = false;
  if (mission.executionPolicy) {
    if (mission.executionPolicy.silentUpdates === true) silent = true;
  }
  let orchestratorId = mission.agentId;
  if (mission.orchestratorAgentId) orchestratorId = mission.orchestratorAgentId;
  userProgress.report({ orchestratorId: orchestratorId, sourceAgentId: mission.agentId, silent: silent });
  void milestone;
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

function maybeExecuteDecision(mission, event) {
  const evidence = require('./agentEvidenceService');
  if (evidence.hasDecisionEvidence(event) === false) return;
  const decision = decideFromEvent(event);
  if (!decision) return;
  let ownerId = mission.agentId;
  if (mission.orchestratorAgentId) ownerId = mission.orchestratorAgentId;
  let gateId = null;
  if (decision.gateId) gateId = decision.gateId;
  emit(ownerId, 'ORCHESTRATION_DECISION_GATE', decision.action, decision.reason, { gateId: gateId, sourceAgentId: mission.agentId, sourceEvent: event.eventType }, 'info');
  actionExecutor.execute({ orchestratorId: ownerId, sourceAgentId: mission.agentId, decision: decision, event: event, workspaceRoot: mission.workspaceRoot }).catch(() => undefined);
}

async function publishLocalSuccess(ctx) {
  const { recordWorkerEvidence } = require('./agentEvidenceService');
  recordWorkerEvidence(ctx.mission, ctx.event);
  reportMilestone(ctx.mission, ctx.event);
  await strategyExecution.recordExecutionEvent(ctx.db, ctx.mission.agentId, ctx.event);
  await advanceAutonomousRound(ctx.mission, ctx.event);
  maybeEmitDecisionBlocked(ctx.mission, ctx.event);
  maybeExecuteDecision(ctx.mission, ctx.event);
  await scheduleWorkspaceCleanup(ctx.mission.agentId);
}

async function emitLocalCompleted(ctx) {
  await updateAgent(ctx.mission.agentId, 'completed', ctx.statusText);
  const completed = emit(
    ctx.mission.agentId,
    ctx.eventType,
    ctx.kind,
    ctx.detail,
    {
      executionRunId: ctx.executionRun.id,
      model: ctx.model,
      provider: ctx.provider,
      evidenceReport: ctx.evidenceReport,
      noAnswerProof: ctx.noAnswerProof,
      proposal: ctx.proposal,
      usage: ctx.usage
    },
    'info',
    'completed'
  );
  await publishLocalSuccess({ db: ctx.db, mission: ctx.mission, event: completed });
  return completed;
}

async function runGenerationStage(ctx) {
  const codeWorker = isCodeWorkerMission(ctx.mission);
  const estimate = estimatePromptTokens(ctx.mission.prompt);
  const budget = resolveTokenBudget(ctx.mission);
  throwIfPromptOverBudget(estimate, budget);
  const agentName = resolveAgentName(ctx.mission);
  const nameMeaning = resolveNameMeaning(ctx.mission, agentName);
  const selfIntro = agentIdentity.formatSelfIntroduction(agentName, nameMeaning, ctx.mission.role);
  const conscienceState = await agentConscience.loadConscienceState(ctx.db, ctx.mission.agentId);
  const conscienceBlock = agentConscience.formatConsciencePrompt(conscienceState);
  const workerModel = resolveWorkerModel(ctx.mission);
  const promptText = buildAnalysisPrompt({
    codeWorker: codeWorker,
    orchestrator: isOrchestratorMission(ctx.mission),
    selfIntro: selfIntro,
    conscienceBlock: conscienceBlock,
    agentName: agentName,
    prompt: ctx.mission.prompt
  });
  const result = await generateWorkerResult({
    db: ctx.db,
    mission: ctx.mission,
    workerModel: workerModel,
    latencyMs: resolveLatency(ctx.mission),
    maxTokens: resolveMaxTokens(budget, estimate),
    maxCost: resolveMaxCost(ctx.mission),
    policy: resolvePolicy(ctx.mission, workerModel),
    promptText: promptText
  });
  return { codeWorker: codeWorker, estimate: estimate, budget: budget, agentName: agentName, nameMeaning: nameMeaning, workerModel: workerModel, result: result };
}

async function runEvidenceStage(ctx) {
  const consumed = consumedTokensOf(ctx.result);
  throwIfConsumedOverBudget(consumed, ctx.budget);
  const proposal = await resolveProposal({ codeWorker: ctx.codeWorker, workspaceRoot: ctx.mission.workspaceRoot, text: ctx.result.text });
  throwIfProposalFailed(proposal);
  const immuneReport = resolveImmuneReport({ text: ctx.result.text, agentName: ctx.agentName, nameMeaning: ctx.nameMeaning, role: ctx.mission.role });
  throwIfImmuneRejected(immuneReport);
  const evidenceReport = immuneReport.report;
  attachProposalTests(evidenceReport, proposal);
  const proof = resolveNoAnswerProof(evidenceReport);
  const noAnswer = isNoAnswerReport(evidenceReport, proof);
  if (noAnswer === false) assertClaimsHaveEvidence(evidenceReport);
  return { consumed: consumed, proposal: proposal, evidenceReport: evidenceReport, proof: proof, noAnswer: noAnswer };
}

function isBudgetBlocked(error) {
  if (error.code === 'BUDGET_EXHAUSTED') return true;
  if (/budget|timeout/i.test(error.message)) return true;
  return false;
}

async function publishLocalFailure(ctx) {
  const { recordWorkerEvidence } = require('./agentEvidenceService');
  const blocked = isBudgetBlocked(ctx.error);
  let status = 'error';
  if (blocked) status = 'blocked';
  await updateAgent(ctx.mission.agentId, status, ctx.error.message);
  let eventType = 'AGENT_FAILED';
  if (blocked) eventType = 'AGENT_HALTED';
  let action = 'LOCAL_MODEL';
  if (blocked) action = 'BUDGET_GUARD';
  let eventStatus = 'error';
  if (blocked) eventStatus = 'blocked';
  const failed = emit(
    ctx.mission.agentId,
    eventType,
    action,
    ctx.error.message,
    { executionRunId: ctx.executionRun.id, model: ctx.mission.localModel },
    'warning',
    eventStatus
  );
  recordWorkerEvidence(ctx.mission, failed);
  reportMilestone(ctx.mission, failed);
  await strategyExecution.recordExecutionEvent(ctx.db, ctx.mission.agentId, failed);
  await advanceAutonomousRound(ctx.mission, failed);
  if (blocked === false) queueWorkerRecovery(ctx.mission, failed);
  await scheduleWorkspaceCleanup(ctx.mission.agentId);
  return { started: false, executionRun: ctx.executionRun, local: true, error: ctx.error.message };
}

async function runLocalWorker(db, mission, executionRun) {
  await updateAgent(mission.agentId, 'running', mission.prompt);
  await emitLocalStarted({ db: db, mission: mission, localModel: mission.localModel, criteria: mission.localRoutingCriteria });
  try {
    const generation = await runGenerationStage({ db: db, mission: mission });
    const evidence = await runEvidenceStage({
      result: generation.result,
      budget: generation.budget,
      codeWorker: generation.codeWorker,
      mission: mission,
      agentName: generation.agentName,
      nameMeaning: generation.nameMeaning
    });
    let eventType = 'AGENT_COMPLETED';
    if (evidence.noAnswer) eventType = 'WORKER_NO_ANSWER_PROVEN';
    let kind = 'LOCAL_REVIEW';
    if (generation.codeWorker) kind = 'LOCAL_CODE_PROPOSAL';
    if (evidence.noAnswer) kind = 'REPORT_NO_ANSWER';
    let detail = 'Local-model worker completed its evidence review.';
    if (generation.codeWorker) detail = 'Local worker produced a non-merged capsule diff and test evidence.';
    if (evidence.noAnswer) detail = 'Local worker returned an evidence-backed proof that no answer exists in the stated scope.';
    let statusText = 'Local review completed';
    if (evidence.noAnswer) statusText = 'No answer proven';
    let noAnswerProof = undefined;
    if (evidence.noAnswer) noAnswerProof = evidence.proof;
    await emitLocalCompleted({
      db: db,
      mission: mission,
      statusText: statusText,
      eventType: eventType,
      kind: kind,
      detail: detail,
      executionRun: executionRun,
      model: generation.result.model,
      provider: generation.result.provider,
      evidenceReport: evidence.evidenceReport,
      noAnswerProof: noAnswerProof,
      proposal: evidence.proposal,
      usage: { input_tokens: generation.result.inputTokens, output_tokens: generation.result.outputTokens, cost_usd: generation.result.costUsd, tokens: evidence.consumed }
    });
    return { started: true, executionRun: executionRun, local: true, result: generation.result };
  } catch (error) {
    return publishLocalFailure({ db: db, mission: mission, executionRun: executionRun, error: error });
  }
}

module.exports = { runLocalWorker };
