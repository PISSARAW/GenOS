#!/usr/bin/env node
const path = require('path');
try {
  process.loadEnvFile(path.resolve(__dirname, '../../.env'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const { getDatabase, closeDatabase, withWriteRetry } = require('../src/db');
const runtime = require('../src/services/agentRuntimeAdapter');
const { createOrchestratorId } = require('../src/services/orchestratorIdFactory');
const missionIdentity = require('../src/services/missionIdentityService');
const { missionExecutionTerminal } = require('../src/services/orchestratorMissionStatus');
const { finalizeMissionStatus, destructureContResult, computeFinalVerdict } = require('./orchestratorMissionFinalization.cjs');
const telemetry = require('../src/services/telemetryObserver');
const missionContinuity = require('../src/services/missionContinuityService');
const { maybeDispatchContinuation } = require('./homeostasisContinuationHelper.cjs');
const { waitForContinuationAndReevaluate, runBoundedContinuationLoop } = require('./continuationFeedbackLoop.cjs');
const { handleAction, handleBackground, initializeMission } = require('./orchestratorActions.cjs');
const { normalizeAllowedCommands } = require('../src/services/sandboxCommandPolicy');
const helpers = require('./orchestratorMissionHelpers.cjs');
const requestMemory = require('./requestMemoryBridge.cjs');
const missionCheckpoint = require('../src/services/communication/missionCheckpointBridge');
const missionEpisodeRuntime = require('../src/services/missionEpisodeRuntime');
const { buildActionContext, runActionWithCleanup, emitTopologyEvent, applyNceEnhancements } = require('./orchestratorActionContext.cjs');
const { buildNceInput, buildEnhancedPrompt, prepareMission, startOrchestratorMission,
  buildContinuity, emitCompletionEvent, gatherTelemetryAndCoverage, emitFinalTelemetry, tokenUsage,
  shouldAttachMissionOrchestrator } = helpers;
const { buildMissionContext } = require('./orchestratorMissionHelpersBuildContext.cjs');
const completionPolling = require('./orchestratorCompletionPolling.cjs');
let request = {};
try {
  const helper = require('./detachedSpawn.cjs');
  request = JSON.parse(helper.loadArgv(process.argv) || process.argv[2] || '{}');
  require('./orchestratorRequestValidation.cjs').validatePayload(request);
} catch (error) {
  process.stderr.write(`[genos-orchestrate] Invalid JSON payload argument: ${error.message}\n`);
  process.exit(1);
}
const biologicalModes = new Set(['biome', 'syncytium', 'holobionte', 'biocenose', 'rhizome', 'metapopulation']);
const mathematicalModes = new Set(['math', 'mathematique', 'formel', 'deterministe', 'proof']);
const strategy = String(request.strategy || '').toLowerCase();
const task = String(request.mission || request.task || 'Autonomous GenOS orchestration');
const isMathMission = request.workerKind === 'math_worker' || mathematicalModes.has(strategy) || request.action === 'math_deterministic_solve';
const action = request.action || (biologicalModes.has(strategy) ? 'dispatch_biological' : 'orchestrate');
let orchestratorId = request.orchestratorId;
let missionId = request.missionId || process.env.GENOS_MISSION_ID || null;
let id = action === 'dispatch_worker' ? request.workerId : null;
let synthesizedWorkerMission = false;
const policyRequest = request.arguments && typeof request.arguments === 'object' ? request.arguments : request;
const allowedCommands = normalizeAllowedCommands(
  policyRequest.allowed_commands ?? policyRequest.allowedCommands
) || [];
const allowFileEdits = policyRequest.allow_file_edits === true || policyRequest.allowFileEdits === true;
try { if (!isMathMission) require('./orchestratorRequestValidation.cjs').validateRequest(action, { ...policyRequest, timeoutMs: policyRequest.timeoutMs ?? request.timeoutMs }); }
catch (error) { process.stderr.write(error.message + '\n'); process.exit(1); }
const workerSafeActions = new Set(['organization_publish', 'organization_inbox', 'organization_state', 'philosophy']);
if (!isMathMission && String(process.env.GENOS_EXECUTION_MODE || '').toLowerCase() === 'worker' && !workerSafeActions.has(action)) {
  const owner = process.env.GENOS_ORCHESTRATOR_AGENT_ID || 'its orchestrator';
  const msg = `GenOS worker recursion blocked: delegated workers must return evidence to ${owner}, not create another orchestrator.`;
  process.stderr.write(`[genos-orchestrate] ${msg}\n`);
  process.exitCode = 1;
  process.exit(1);
}
const SCRIPT_START_TIME = Date.now();
const TOP_LEVEL_MISSION_ACTIONS = new Set(['orchestrate', 'dispatch_team', 'dispatch_trinity', 'dispatch_biological']);
const missionAux = require('./orchestratorMissionAux.cjs');
function waitForCompletionUnbounded() {
  return policyRequest.unbounded === true || policyRequest.noTimeout === true
    || request.unbounded === true || request.noTimeout === true;
}
async function waitForCompletion(db) {
  const unbounded = waitForCompletionUnbounded();
  const baseTimeout = Number(policyRequest.timeoutMs ?? request.timeoutMs ?? 600000);
  const deadline = unbounded ? null : Math.max(Date.now() + 5000, SCRIPT_START_TIME + baseTimeout);
  let pulseTick = 0;
  let busyRetries = 0;
  while (completionPolling.withinDeadline(unbounded, deadline)) {
    const poll = await completionPolling.poll(db, { agentId: id, startedAt: SCRIPT_START_TIME }, busyRetries);
    if (poll.retry) { busyRetries = poll.busyRetries; continue; }
    const { agents, trinityWorlds } = poll;
    busyRetries = 0;
    if (missionExecutionTerminal(agents, trinityWorlds, id)) return agents;
    if (completionPolling.allOrphaned(agents, SCRIPT_START_TIME)) {
      process.stderr.write(`[genos-orchestrate] All agents orphaned (running, no pid) after 30s; concluding mission.\n`);
      return agents;
    }
    pulseTick += 1;
    await observeMissionPulse(db, pulseTick);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('GenOS orchestrator timed out');
}

async function observeMissionPulse(db, pulseTick) {
  if (pulseTick % 10 !== 0) return;
  try {
    await missionContinuity.observeMissionPulses(db, missionId || id);
    if (missionId && action === 'orchestrate') await regenerateDuringExecution(db);
  } catch (error) {
    telemetry.emitEvent({ eventType: 'MISSION_CONTINUITY_REPAIR_FAILED', agentId: id,
      action: 'REGENERATE', detail: error.message, severity: 'error' });
  }
}

async function regenerateDuringExecution(db) {
  const executionBudget = policyRequest.executionBudget || policyRequest.execution_budget;
  if (!Number.isSafeInteger(Number(executionBudget?.tokens)) || Number(executionBudget.tokens) <= 0) return;
  const organism = await missionContinuity.assembleOrganism(db, { id: missionId, objective: task });
  const contract = await require('../src/services/strategyContractService').getLatestContract(db, id);
  await missionContinuity.regenerateMissingWorkers(db, {
    missionId, orchestratorAgentId: id, organism, objective: task, executionBudget,
    executionPolicy: { allowedCommands, allowFileEdits },
    strategyContract: contract?.contract, timeoutMs: policyRequest.timeoutMs
  });
}

async function prepareRuntime(initDb) {
  if (TOP_LEVEL_MISSION_ACTIONS.has(action)) {
    require('../src/services/gvxLedgerIntegrity').assertSigningKeyConfigured();
    await require('./missionWorkspaceScope.cjs').applyMissionWorkspace(initDb, request);
  }
  await runtime.reconcilePersistedRuntimes(initDb);
  await missionEpisodeRuntime.reconcileAbandoned(initDb);
  if (!orchestratorId && !TOP_LEVEL_MISSION_ACTIONS.has(action)) orchestratorId = await findActiveOrchestrator(initDb);
  if (!orchestratorId) orchestratorId = createOrchestratorId('mcp_orchestrator');
  if (!id) id = action === 'dispatch_worker' ? createOrchestratorId(`worker_${orchestratorId}`) : orchestratorId;
  if (action === 'dispatch_worker' && !missionId) {
    missionId = missionIdentity.newMissionId();
    await missionIdentity.create(initDb, { missionId, objective: task, orchestratorAgentId: orchestratorId });
    synthesizedWorkerMission = true;
  }
  if (TOP_LEVEL_MISSION_ACTIONS.has(action)) await ensureMissionIdentity(initDb);
}

async function findActiveOrchestrator(db) {
  const requestedRoot = request.workspace_root || request.workspaceRoot || process.env.GENOS_WORKSPACE_ROOT;
  const resolvedRoot = requestedRoot ? path.resolve(requestedRoot) : null;
  const active = await db.get(`SELECT a.id FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id
    WHERE a.execution_mode = 'orchestrator' AND a.status NOT IN ('completed', 'terminated', 'apoptosis', 'error', 'failed', 'unverified', 'quarantined')
      AND (a.is_apoptotic = 0 OR a.is_apoptotic IS NULL)
      AND (? IS NULL OR w.path IS NULL OR w.path = ?)
    ORDER BY a.updated_at DESC, a.created_at DESC LIMIT 1`, resolvedRoot, resolvedRoot);
  return active?.id || null;
}

async function ensureMissionIdentity(db) {
  missionId = missionId || missionIdentity.newMissionId();
  await require('../src/services/missionRegenerationChecksService').initializeMission(db, { missionId, objective: task, checks: policyRequest.regenerationChecks || policyRequest.regeneration_checks });
}

async function evaluateMissionContinuity(opts) {
  const { db, id, task, outcome, agents } = opts;
  let continuity = null;
  let mission = null;
  let completionGate = { allowed: false, reason: 'continuity evaluation did not run' };
  let evaluation = null;
  let organism = null;
  let effectiveOutcome = outcome;
  try {
    const current = await missionContinuity.effectiveMissionOutcome(db, missionId || id);
    const members = current.members;
    effectiveOutcome = current.outcome;
    const context = await buildMissionContext({ outcome: effectiveOutcome, policyRequest, request, db, missionId: missionId || id, agents: members });
    mission = missionContinuity.buildMissionInput(missionId || id, task, {
      orchestratorAgentId: id,
      completionContract: context.completionContract,
      invariants: context.invariants,
      safetyConstraints: context.safetyConstraints,
      context: context.context
    });
    const evalResult = await evaluateAndRepairMission({ db, id, task, outcome: effectiveOutcome, agents: members, mission });
    evaluation = evalResult;
    organism = evalResult.organism;
    continuity = { ...buildContinuity(evalResult), missionId: mission.id };
    const gate = await missionContinuity.transitionMissionToComplete(db, { organism: evalResult.organism, mission, context: mission.context, immune: evalResult.immune });
    completionGate = { allowed: gate.allowed, reason: gate.reason || null };
    emitCompletionEvent({ id, gateAllowed: gate.allowed, evaluation: evalResult, continuity, completionGate });
    await missionCheckpoint.evaluateMissionCompletion({ db, agentId: id,
      missionId: mission.id, gateAllowed: gate.allowed });
  } catch (continuityError) {
    continuity = { status: 'unknown', error: continuityError.message };
    completionGate = { allowed: false, reason: continuityError.message };
  }
  return { continuity, completionGate, evaluation, organism, mission, outcome: evaluation?.repairedOutcome || effectiveOutcome };
}

async function evaluateAndRepairMission(input) {
  let evaluation = await missionContinuity.evaluateContinuity(input.db, input.mission);
  if (evaluation.status === 'homeostasis_satisfied') return evaluation;
  const replacements = await regenerateUncoveredWorkers(input, evaluation);
  if (!replacements.some((replacement) => replacement.success)) return evaluation;
  const current = await missionContinuity.effectiveMissionOutcome(input.db, input.mission.id);
  const repairedOutcome = current.outcome;
  const context = await buildMissionContext({ outcome: repairedOutcome, policyRequest, request, db: input.db, missionId: input.mission.id, agents: current.members });
  input.mission.context = context.context;
  evaluation = await missionContinuity.evaluateContinuity(input.db, input.mission);
  return { ...evaluation, repairedOutcome };
}

async function regenerateUncoveredWorkers(input, evaluation) {
  const contract = await require('../src/services/strategyContractService').getLatestContract(input.db, input.id);
  return missionContinuity.regenerateMissingWorkers(input.db, {
    missionId: input.mission.id, orchestratorAgentId: input.id, organism: evaluation.organism,
    objective: input.task,
    executionBudget: policyRequest.executionBudget || policyRequest.execution_budget || request.executionBudget,
    executionPolicy: { allowedCommands, allowFileEdits },
    strategyContract: contract?.contract, timeoutMs: policyRequest.timeoutMs
  });
}

async function handleHomeostasisContinuation({ db, id, task, request, mission, completionGate, evaluation, organism, finalVerdict, continuity }) {
  const summarizeAgents = require('../src/services/orchestratorOutcome').summarizeAgents;
  const safeMission = { ...(mission || {}), id: (mission && mission.id) || id };
  const seed = { continuity: continuity || {}, completionGate, evaluation, organism, finalVerdict };
  const dispatchOne = (state) => maybeDispatchContinuation({
    db, orchestratorId: id, task, request, mission: safeMission,
    completionGate: state.completionGate, evaluation: state.evaluation,
    organism: state.organism, finalVerdict: state.finalVerdict, continuity: state.continuity
  });
  const first = await dispatchOne(seed);
  if (!first.dispatched || !first.dispatched.targetAgentId) {
    return { continuity: seed.continuity, completionGate, evaluation, organism, finalVerdict: first.finalVerdict };
  }
  return runBoundedContinuationLoop({
    db, id, task, evaluateMissionContinuity, summarizeAgents,
    seed, dispatchOne, firstDispatch: first
  });
}

async function executeMission(db, state) {
  if (await missionAux.checkMinimalShortcut({ db, action, requestMemory, request, task, telemetry, id })) return;
  await initializeMission({ db, action, orchestratorId, task, request });
  const episodeRuntime = await missionEpisodeRuntime.ensureApplicable(db, { missionId, orchestratorId, action, request });
  missionEpisodeRuntime.propagate(request, episodeRuntime);
  if (await executeRequestedAction({ db, state })) return;
  await runOrchestratedMission(db, episodeRuntime);
}

async function executeRequestedAction(input) {
  const { db, state } = input;
  if (shouldAttachMissionOrchestrator(action, missionId, synthesizedWorkerMission)) {
    await missionIdentity.attachOrchestrator(db, {
      missionId, agentId: orchestratorId, expectedOrchestratorId: request.expectedOrchestratorId
    });
  }
  const actionContext = buildActionContext({ db, action, request, task, orchestratorId, id, missionId, waitForCompletion });
  const handled = await runActionWithCleanup(actionContext, handleAction, state);
  if (!handled) return false;
  emitTopologyEvent(actionContext.orchestratorId, actionContext.action);
  return true;
}

async function runOrchestratedMission(db, episodeRuntime) {
  await require('../src/services/rustKernelMissionPlanService').persist(db, { missionId: missionId || id, objective: task, envelope: request.rustKernelPlan });
  const nceEnhancements = await applyNceEnhancements(buildNceInput(request), db, orchestratorId);
  const { enhancedPrompt, nceMetadata } = buildEnhancedPrompt(nceEnhancements, task);
  const { strategyContract, missionBudget, useLocalRuntime, requestTimeoutMs, garageDecision, morphology } = await prepareMission({ db, enhancedPrompt, id, policyRequest, request, nceMetadata });
  const morphologySnapshot = await missionAux.persistMorphologySnapshot({
    db, missionId: missionId || id, morphology, telemetry, agentId: id });
  const autonomyPlan = require('../src/services/autonomousOrchestrationService').buildAutonomyPlan(strategyContract.contract, missionBudget, request);
  const preflightBridge = require('./orchestratorMcpPreflight.cjs');
  const preflight = await preflightBridge.runOrchestratorMcpPreflight(
    preflightBridge.buildOrchestratorPreflightInput({ db, orchestratorId: id, missionId, task,
      repoRoot: path.resolve(__dirname, '../..'), request,
      workspaceRoot: process.env.GENOS_WORKSPACE_ROOT,
      tools: preflightBridge.baselineTools(autonomyPlan) }));
  const workerGarage = require('../src/services/workerGarageService');
  workerGarage.setDynamicCapacity(id, garageDecision.capacity);
  if (missionId) await missionIdentity.attachOrchestrator(db, { missionId, agentId: id, expectedOrchestratorId: request.expectedOrchestratorId });
  if (process.platform === 'win32' && useLocalRuntime) {
    await require('./orchestratorWindowsLocalExecution.cjs').runWindowsLocalExecution({
      db, id, missionId, task, enhancedPrompt, request, missionBudget,
      requestTimeoutMs, allowedCommands, allowFileEdits, morphology,
      autonomyPlan, nceEnhancements, evaluateMissionContinuity, gatherTelemetryAndCoverage,
      finalizeOrchestratedMission, preflight
    });
    return;
  }

  const launch = await startOrchestratorMission({ db, strategyContract, missionBudget, useLocalRuntime, requestTimeoutMs, id, missionId, enhancedPrompt, policyRequest, request, allowedCommands, allowFileEdits, runtime, morphology, preflightObservedTools: preflight.observedTools });
  await missionEpisodeRuntime.bindOwner(db, { runtime: episodeRuntime, launch, orchestratorId: id });
  const agents = await waitForCompletion(db);
  const outcome = require('../src/services/orchestratorOutcome').summarizeAgents(agents);
  const evaluation = await evaluateMissionContinuity({ db, id, task, outcome, agents });
  const audit = await gatherTelemetryAndCoverage(db, id);
  await finalizeOrchestratedMission({ db, outcome, evaluation, morphology, morphologySnapshot, nceEnhancements, audit });
}

async function applyHomeostasisContinuation(input) {
  const { db, id, task, request, mission, completionGate, evaluation: homeostasis, organism, finalVerdict, continuity } = input;
  const contResult = await handleHomeostasisContinuation({ db, id, task, request, mission, completionGate, evaluation: homeostasis, organism, finalVerdict, continuity });
  return {
    continuity: contResult.continuity,
    completionGate: contResult.completionGate,
    homeostasis: contResult.evaluation,
    organism: contResult.organism,
    finalVerdict: contResult.finalVerdict,
    outcome: contResult.outcome,
    mission: contResult.mission
  };
}
async function finalizeOrchestratedMission(input) {
  const { db, evaluation, morphology, morphologySnapshot, nceEnhancements, outcome: inputOutcome, audit } = input;
  let outcome = evaluation.outcome || inputOutcome;
  let { continuity, completionGate, evaluation: homeostasis, organism, mission } = evaluation;
  const missionSuccess = completionGate.allowed === true;
  let finalVerdict = computeFinalVerdict(missionSuccess, outcome, completionGate);

  await missionAux.executeMorphology({ db, morphology, snapshotRef: morphologySnapshot,
    outcome, finalVerdict, orchestratorId: id, missionId: missionId || id, telemetry });

  const contResult = await applyHomeostasisContinuation({ db, id, task, request, mission, completionGate, homeostasis, organism, finalVerdict, continuity });
  ({ continuity, completionGate, homeostasis, organism, finalVerdict, outcome, mission } = destructureContResult(contResult, { continuity, completionGate, homeostasis, organism, finalVerdict, outcome, mission }));

  const { finalStatus, finalVerdict: updatedVerdict } = await finalizeMissionStatus({ db, outcome, completionGate, finalVerdict, coverage: audit.coverage });
  finalVerdict = updatedVerdict;

  const dormant = await suspendIfNeeded({ db, mission, homeostasis, organism, finalStatus, continuity });
  if (dormant) finalVerdict = 'mission_dormant';
  if (missionId && !dormant) await missionIdentity.setStatus(db, missionId, finalStatus.success ? 'completed' : 'failed');
  if (input.deferredAgentTerminalStatus && !dormant) await require('./orchestratorMissionFinalization.cjs').settleDeferredAgent({
    agentId: id, status: finalStatus.success ? 'completed' : 'failed', verdict: finalVerdict
  });

  if (finalStatus.success) await persistChampion(db, outcome);
  emitFinalTelemetry({ ...audit, nceEnhancements, missionSuccess: finalStatus.success, finalVerdict, continuity, completionGate, id, missionId });
  if (!finalStatus.success && !dormant) process.exitCode = 2;
}

async function suspendIfNeeded({ db, mission, homeostasis, organism, finalStatus, continuity }) {
  if (finalStatus.success || !request.dormancy || !missionId) return false;
  return missionContinuity.suspendMission(db, {
    missionId, orchestratorAgentId: id, organism, objective: task,
    invariants: mission?.invariants, completionContract: mission?.completionContract,
    homeostasis: homeostasis?.state,
    workspaceId: request.workspaceId || request.workspace_id,
    workspaceRoot: request.workspaceRoot || request.workspace_root,
    reason: request.dormancy.reason, wakeCondition: request.dormancy.wakeCondition,
    evidence: continuity?.evidence || [], remainingWork: request.dormancy.remainingWork,
    eligibility: request.dormancy.eligibility || {}
  }).then((result) => result.entered === true);
}

async function persistChampion(db, outcome) {
  try {
    const checked = await requestMemory.checkReuse(db, request, task);
    await requestMemory.storeMissionResult(db, { minted: checked.minted, route: checked.route,
      scopeId: checked.scopeId, summary: outcome, request });
  } catch (_) {}
}

async function cleanupFailure(db, state, error) {
  const topologyFailure = { dispatch_team: 'A_TEAM_STAGES_FAILED', dispatch_trinity: 'TRINITY_MISSION_FAILED', dispatch_biological: 'BIOLOGICAL_MISSION_FAILED' }[action];
  if (topologyFailure) telemetry.emitEvent({ eventType: topologyFailure, agentId: id, action: 'TOPOLOGY_FAILED', detail: error.message, payload: { action }, severity: 'error' });
  if (!['orchestrate', 'dispatch_worker', 'dispatch_team', 'dispatch_trinity', 'dispatch_biological'].includes(action)) return;
  try { await runtime.stopMission(id); } catch (_) {}
  await db.run("UPDATE agents SET status = 'error', current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", error.message, id).catch(() => {});
  if (missionId) await missionIdentity.setStatus(db, missionId, 'failed').catch(() => {});
  if (!state.delegatedWorkerId) return;
  await db.run("UPDATE agents SET status = 'error', current_task = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", error.message, state.delegatedWorkerId).catch(() => {});
  await db.run("UPDATE trinity_worlds SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE agent_id = ?", state.delegatedWorkerId).catch(() => {});
}

async function executeForeground(db) {
  const state = {};
  try { await executeMission(db, state); } catch (error) { await cleanupFailure(db, state, error); throw error; }
  finally {
    if (request.detachedProcessId) await db.run('DELETE FROM detached_processes WHERE id = ?', request.detachedProcessId).catch(() => {});
    await require('../src/services/telemetryShutdownService').closeAfterFlush({ telemetry, closeDatabase });
  }
}

async function main() {
  const initDb = await withWriteRetry(() => getDatabase(), { maxRetries: 10, baseDelayMs: 200 });
  await prepareRuntime(initDb);
  if (request.background === true) {
    await handleBackground({ request, action, task, orchestratorId, id, repoRoot: path.resolve(__dirname, '../..'), bridgePath: __filename, getDatabase, closeDatabase });
    return;
  }
  await executeForeground(await getDatabase());
}

async function runMathShortcut() {
  const result = await require('./mathMissionShortcut.cjs').runMathMissionShortcut({ request, task });
  process.stdout.write(JSON.stringify(result));
}

function exitAfterFlush(code) {
  if (process.stdout.writableLength === 0) return process.exit(code);
  process.stdout.write('', () => process.exit(code));
}
const execution = isMathMission ? runMathShortcut() : main();
execution.then(() => exitAfterFlush(process.exitCode || 0)).catch((error) => {
  if (isMathMission) {
    process.stderr.write(JSON.stringify({ error: error.message, code: error.code || 'MATH_MISSION_FAILED' }));
    return exitAfterFlush(1);
  }
  if (error?.stdoutEnvelope) { process.stderr.write(`${error.message}\n`); process.stdout.write(JSON.stringify(error.stdoutEnvelope)); return exitAfterFlush(error.exitCode || 2); }
  console.error(error.stack || error.message); exitAfterFlush(1);
});
