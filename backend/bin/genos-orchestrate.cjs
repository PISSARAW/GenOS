#!/usr/bin/env node
// MCP-to-backend bridge. It owns one complete GenOS mission, including the
// authority contract and bounded worker fleet, then returns its telemetry.
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
const telemetry = require('../src/services/telemetryObserver');
const missionContinuity = require('../src/services/missionContinuityService');
const { maybeDispatchContinuation } = require('./homeostasisContinuationHelper.cjs');
const { waitForContinuationAndReevaluate, runBoundedContinuationLoop } = require('./continuationFeedbackLoop.cjs');
const { handleAction, handleBackground, initializeMission } = require('./orchestratorActions.cjs');
const { normalizeAllowedCommands } = require('../src/services/sandboxCommandPolicy');
const helpers = require('./orchestratorMissionHelpers.cjs');
const requestMemory = require('./requestMemoryBridge.cjs');
const missionCheckpoint = require('../src/services/communication/missionCheckpointBridge');

const { buildActionContext, applyNceEnhancements, buildNceInput, buildEnhancedPrompt,
  prepareMission, startOrchestratorMission, buildContinuity, emitCompletionEvent,
  gatherTelemetryAndCoverage, emitFinalTelemetry, runActionWithCleanup, emitTopologyEvent, tokenUsage } = helpers;
const { buildMissionContext } = require('./orchestratorMissionHelpersBuildContext.cjs');
process.on('unhandledRejection', (reason) => {
  console.error('[genos-orchestrate] Unhandled rejection:', reason && reason.stack ? reason.stack : reason);
});
if (process.env.GENOS_STREAM_TELEMETRY === '1') {
  telemetry.on('telemetry', (evt) => {
    process.stdout.write(`GENOS_STREAM:${JSON.stringify(evt)}\n`);
  });
}

const cliHelp = require('./cliHelp.cjs');
if (cliHelp.checkHelp(process.argv, 'genos-orchestrate.cjs')) return;
let request = {};
try {
  const helper = require('./detachedSpawn.cjs');
  request = JSON.parse(helper.loadArgv(process.argv) || process.argv[2] || '{}');
} catch (error) {
  process.stderr.write(`[genos-orchestrate] Invalid JSON payload argument: ${error.message}\n`);
  process.exit(1);
}

const biologicalModes = new Set(['biome', 'syncytium', 'holobionte', 'biocenose', 'rhizome', 'metapopulation']);
const strategy = String(request.strategy || '').toLowerCase();
const action = request.action || (biologicalModes.has(strategy) ? 'dispatch_biological' : 'orchestrate');
const task = String(request.mission || request.task || 'Autonomous GenOS orchestration');
let orchestratorId = request.orchestratorId;
let missionId = request.missionId || process.env.GENOS_MISSION_ID || null;
let id = action === 'dispatch_worker' ? request.workerId : null;
const policyRequest = request.arguments && typeof request.arguments === 'object' ? request.arguments : request;
const allowedCommands = normalizeAllowedCommands(policyRequest.allowed_commands) || [];
const allowFileEdits = policyRequest.allow_file_edits === true;
const workerSafeActions = new Set(['organization_publish', 'organization_inbox', 'organization_state', 'philosophy']);
if (String(process.env.GENOS_EXECUTION_MODE || '').toLowerCase() === 'worker' && !workerSafeActions.has(action)) {
  const owner = process.env.GENOS_ORCHESTRATOR_AGENT_ID || 'its orchestrator';
  const msg = `GenOS worker recursion blocked: delegated workers must return evidence to ${owner}, not create another orchestrator.`;
  process.stderr.write(`[genos-orchestrate] ${msg}\n`);
  process.exitCode = 1;
  process.exit(1);
}

const SCRIPT_START_TIME = Date.now();
const TOP_LEVEL_MISSION_ACTIONS = new Set(['orchestrate', 'dispatch_team', 'dispatch_trinity', 'dispatch_biological']);

async function waitForCompletion(db) {
  const unbounded = policyRequest.unbounded === true || policyRequest.noTimeout === true
    || request.unbounded === true || request.noTimeout === true;
  const baseTimeout = Number(policyRequest.timeoutMs ?? request.timeoutMs ?? 600000);
  const deadline = unbounded ? null : Math.max(Date.now() + 5000, SCRIPT_START_TIME + baseTimeout);
  let pulseTick = 0;
  let busyRetries = 0;
  while (unbounded || Date.now() < deadline) {
    let agents, trinityWorlds;
    try {
      agents = await db.all('SELECT id, status, runtime_pid FROM agents WHERE id = ? OR parent_agent_id = ?', id, id);
      trinityWorlds = await db.all(
        `SELECT agent_id, status FROM trinity_worlds
         WHERE experiment_id GLOB ? AND datetime(created_at) >= datetime(?)
         ORDER BY world_number`,
        `trinity_${id}*`, new Date(SCRIPT_START_TIME).toISOString()
      );
    } catch (err) {
      if (isRetryableDatabaseError(err)) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(3000, 300 * Math.pow(1.5, busyRetries))));
        busyRetries += 1;
        continue;
      }
      throw err;
    }
    busyRetries = 0;
    if (missionExecutionTerminal(agents, trinityWorlds)) return agents;
    pulseTick += 1;
    await observeMissionPulse(db, pulseTick);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('GenOS orchestrator timed out');
}

function isRetryableDatabaseError(error) {
  return error?.code === 'SQLITE_BUSY' || /busy|locked/i.test(error?.message || '');
}

function missionExecutionTerminal(agents, trinityWorlds) {
  const terminal = ['blocked', 'error', 'terminated', 'apoptosis', 'completed', 'unverified', 'failed', 'quarantined'];
  const allAgentsTerminal = agents.length && agents.every((agent) => !agent.runtime_pid && terminal.includes(agent.status));
  const allTrinityTerminal = trinityWorlds.length === 0 ||
    (trinityWorlds.length >= 3 && trinityWorlds.every((world) => terminal.includes(world.status)));
  return Boolean(allAgentsTerminal && allTrinityTerminal);
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
  await runtime.reconcilePersistedRuntimes(initDb);
  if (!orchestratorId && !TOP_LEVEL_MISSION_ACTIONS.has(action)) orchestratorId = await findActiveOrchestrator(initDb);
  if (!orchestratorId) orchestratorId = createOrchestratorId('mcp_orchestrator');
  if (!id) id = action === 'dispatch_worker' ? createOrchestratorId(`worker_${orchestratorId}`) : orchestratorId;
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
    seed, dispatchOne
  });
}

async function executeMission(db, state) {
  if (await checkMinimalShortcut(db)) return;
  await initializeMission({ db, action, orchestratorId, task });
  if (await executeRequestedAction({ db, state })) return;
  await runOrchestratedMission(db);
}

async function executeRequestedAction(input) {
  const { db, state } = input;
  if (missionId) {
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

async function runOrchestratedMission(db) {
  const nceEnhancements = await applyNceEnhancements(buildNceInput(request), db, orchestratorId);
  const { enhancedPrompt, nceMetadata } = buildEnhancedPrompt(nceEnhancements, task);
  const { strategyContract, missionBudget, useLocalRuntime, requestTimeoutMs, garageDecision, morphology } = await prepareMission({ db, enhancedPrompt, id, policyRequest, request, nceMetadata });
  const workerGarage = require('../src/services/workerGarageService');
  workerGarage.setDynamicCapacity(id, garageDecision.capacity);
  if (missionId) await missionIdentity.attachOrchestrator(db, { missionId, agentId: id, expectedOrchestratorId: request.expectedOrchestratorId });
  await startOrchestratorMission({ db, strategyContract, missionBudget, useLocalRuntime, requestTimeoutMs, id, missionId, enhancedPrompt, policyRequest, request, allowedCommands, allowFileEdits, runtime, morphology });
  const agents = await waitForCompletion(db);
  const outcome = require('../src/services/orchestratorOutcome').summarizeAgents(agents);
  const evaluation = await evaluateMissionContinuity({ db, id, task, outcome, agents });
  await finalizeOrchestratedMission({ db, outcome, evaluation, morphology, nceEnhancements });
}

async function finalizeOrchestratedMission(input) {
  const { db, evaluation, morphology, nceEnhancements } = input;
  const outcome = evaluation.outcome || input.outcome;
  let { continuity, completionGate, evaluation: homeostasis, organism, mission } = evaluation;
  const { telemetryRows, runs, coverage } = await gatherTelemetryAndCoverage(db, id);
  const missionSuccess = completionGate.allowed === true;
  let finalVerdict = missionSuccess ? outcome.verdict : (completionGate.allowed === false && outcome.success === true ? 'homeostasis_blocked' : outcome.verdict);

  await executeMorphology({ morphology, outcome, finalVerdict, orchestratorId: id });

  const contResult = await handleHomeostasisContinuation({ db, id, task, request, mission, completionGate, evaluation: homeostasis, organism, finalVerdict, continuity });
  continuity = contResult.continuity;
  completionGate = contResult.completionGate;
  homeostasis = contResult.evaluation;
  organism = contResult.organism;
  finalVerdict = contResult.finalVerdict;
  const finalStatus = resolveFinalMissionStatus(outcome, completionGate, { verdict: finalVerdict, coverage });
  finalVerdict = finalStatus.verdict;
  const dormant = await suspendUnsuccessfulMission({ db, mission, homeostasis, organism, finalStatus, continuity });
  if (dormant) finalVerdict = 'mission_dormant';
  if (missionId && !dormant) await missionIdentity.setStatus(db, missionId, finalStatus.success ? 'completed' : 'failed');

  await persistMissionChampion(db, outcome);
  emitFinalTelemetry({ telemetryRows, runs, coverage, nceEnhancements, missionSuccess: finalStatus.success, finalVerdict, continuity, completionGate, id, missionId });
  if (!finalStatus.success && !dormant) process.exitCode = 2;
}

function suspendUnsuccessfulMission(input) {
  const { db, mission, homeostasis, organism, finalStatus, continuity } = input;
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

function resolveFinalMissionStatus(outcome, completionGate, evidence) {
  const { verdict, coverage } = evidence;
  if (outcome.success && completionGate.allowed && verdict === 'completed'
    && coverage?.verdict !== 'required-coverage-complete') {
    return { success: false, verdict: 'required_coverage_incomplete' };
  }
  const success = outcome.success === true
    && completionGate.allowed === true
    && verdict === 'completed';
  if (success || verdict !== 'completed') return { success, verdict };
  return { success: false, verdict: completionGate.allowed === true ? outcome.verdict : 'homeostasis_blocked' };
}

async function executeMorphology({ morphology, outcome, finalVerdict, orchestratorId }) {
  if (!morphology?.agents?.length) return;
  const morphoRuntime = require('../src/services/morphogenesis/morphogenesisRuntime').getMorphogenesisRuntime();
  const result = await morphoRuntime.executeMorphology(morphology, {
    orchestratorId, evidence: outcome.evidence,
    reason: `post-mission morphogenesis (verdict=${finalVerdict})`
  });
  const { buildMorphogenesisEvent } = require('../src/services/morphogenesis/morphogenesisTelemetryService');
  telemetry.emitEvent(buildMorphogenesisEvent(result, orchestratorId));
}

async function checkMinimalShortcut(db) {
  if (action !== 'orchestrate') return false;
  const minimal = await requestMemory.maybeHandleMinimal(db, request, task);
  stateOf(minimal);
  if (!minimal.handled) return false;
  process.stdout.write(JSON.stringify(minimal.payload));
  return true;
}

function stateOf(minimal) {
  if (minimal && minimal.minted) {
    telemetry.emitEvent({ eventType: 'REQUEST_ROUTED', agentId: id, action: minimal.route.mode, detail: minimal.route.reason, payload: { requestClass: minimal.minted.profile.request_class }, severity: 'info' });
  }
}

async function persistMissionChampion(db, outcome) {
  try {
    const checked = await requestMemory.checkReuse(db, request, task);
    await requestMemory.storeMissionResult(db, { minted: checked.minted, route: checked.route, summary: outcome, request });
  } catch (_) {}
}

async function cleanupFailure(db, state, error) {
  const topologyFailure = { dispatch_team: 'A_TEAM_STAGES_FAILED', dispatch_trinity: 'TRINITY_MISSION_FAILED', dispatch_biological: 'BIOLOGICAL_MISSION_FAILED' }[action];
  if (topologyFailure) telemetry.emitEvent({ eventType: topologyFailure, agentId: id, action: 'TOPOLOGY_FAILED', detail: error.message, payload: { action }, severity: 'error' });
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
    await closeDatabase();
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

function exitAfterFlush(code) {
  if (process.stdout.writableLength === 0) return process.exit(code);
  process.stdout.write('', () => process.exit(code));
}
main().then(() => exitAfterFlush(process.exitCode || 0)).catch((error) => {
  console.error(error.stack || error.message);
  exitAfterFlush(1);
});
