#!/usr/bin/env node
// MCP-to-backend bridge. It owns one complete GenOS mission, including the
// authority contract and bounded worker fleet, then returns its telemetry.
const path = require('path');
const { getDatabase, closeDatabase } = require('../src/db');
const runtime = require('../src/services/agentRuntimeAdapter');
const { createOrchestratorId } = require('../src/services/orchestratorIdFactory');
const telemetry = require('../src/services/telemetryObserver');
const missionContinuity = require('../src/services/missionContinuityService');
const { maybeDispatchContinuation } = require('./homeostasisContinuationHelper.cjs');
const { waitForContinuationAndReevaluate, runBoundedContinuationLoop } = require('./continuationFeedbackLoop.cjs');
const { handleAction, handleBackground, initializeMission } = require('./orchestratorActions.cjs');
const { normalizeAllowedCommands } = require('../src/services/sandboxCommandPolicy');
const helpers = require('./orchestratorMissionHelpers.cjs');
const requestMemory = require('./requestMemoryBridge.cjs');

const {
  buildActionContext, applyNceEnhancements, buildNceInput, buildEnhancedPrompt,
  prepareMission, startOrchestratorMission,
  buildContinuity, emitCompletionEvent,
  gatherTelemetryAndCoverage, emitFinalTelemetry, runActionWithCleanup,
  emitTopologyEvent, tokenUsage
} = helpers;
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
  request = JSON.parse(process.argv[2] || '{}');
} catch (error) {
  process.stderr.write(`[genos-orchestrate] Invalid JSON payload argument: ${error.message}\n`);
  process.exit(1);
}

const biologicalModes = new Set(['biome', 'syncytium', 'holobionte', 'biocenose', 'rhizome', 'metapopulation']);
const strategy = String(request.strategy || '').toLowerCase();
const action = request.action || (biologicalModes.has(strategy) ? 'dispatch_biological' : 'orchestrate');
const task = String(request.mission || request.task || 'Autonomous GenOS orchestration');
let orchestratorId = request.orchestratorId;
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

async function waitForCompletion(db) {
  const baseTimeout = Number(policyRequest.timeoutMs ?? request.timeoutMs ?? 14 * 60 * 1000);
  const deadline = Math.max(Date.now() + 5000, SCRIPT_START_TIME + baseTimeout);
  let pulseTick = 0;
  while (Date.now() < deadline) {
    const agents = await db.all('SELECT id, status FROM agents WHERE id = ? OR parent_agent_id = ?', id, id);
    if (agents.length && agents.every((agent) => ['blocked', 'error', 'terminated', 'apoptosis', 'completed', 'unverified', 'failed', 'quarantined'].includes(agent.status))) return agents;
    pulseTick += 1;
    if (pulseTick % 10 === 0) {
      try { await missionContinuity.observeMissionPulses(db, id); } catch (_) {}
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('GenOS orchestrator timed out');
}

async function prepareRuntime(initDb) {
  await runtime.reconcilePersistedRuntimes(initDb);
  const topLevelMissionActions = new Set(['orchestrate', 'dispatch_team', 'dispatch_trinity', 'dispatch_biological']);
  if (!orchestratorId && !topLevelMissionActions.has(action)) {
    const requestedRoot = request.workspace_root || request.workspaceRoot || process.env.GENOS_WORKSPACE_ROOT;
    const resolvedRoot = requestedRoot ? path.resolve(requestedRoot) : null;
    const active = await initDb.get(
      `SELECT a.id FROM agents a LEFT JOIN workspaces w ON w.id = a.workspace_id
       WHERE a.execution_mode = 'orchestrator' AND a.status NOT IN ('completed', 'terminated', 'apoptosis', 'error', 'failed', 'unverified', 'quarantined')
         AND (a.is_apoptotic = 0 OR a.is_apoptotic IS NULL)
         AND (? IS NULL OR w.path IS NULL OR w.path = ?)
       ORDER BY a.updated_at DESC, a.created_at DESC LIMIT 1`,
      resolvedRoot, resolvedRoot
    );
    if (active) orchestratorId = active.id;
  }
  if (!orchestratorId) orchestratorId = createOrchestratorId('mcp_orchestrator');
  if (!id) id = action === 'dispatch_worker' ? createOrchestratorId(`worker_${orchestratorId}`) : orchestratorId;
}

async function evaluateMissionContinuity(opts) {
  const { db, id, task, outcome, agents } = opts;
  let continuity = null;
  let mission = null;
  let completionGate = { allowed: false, reason: 'continuity evaluation did not run' };
  let evaluation = null;
  let organism = null;
  try {
    const context = await buildMissionContext({ outcome, policyRequest, request, db, missionId: id, agents });
    mission = missionContinuity.buildMissionInput(id, task, {
      completionContract: context.completionContract,
      invariants: context.invariants,
      safetyConstraints: context.safetyConstraints,
      context: context.context
    });
    const evalResult = await missionContinuity.evaluateContinuity(db, mission);
    evaluation = evalResult;
    organism = evalResult.organism;
    continuity = buildContinuity(evalResult);
    const gate = await missionContinuity.transitionMissionToComplete(db, { organism: evalResult.organism, mission, context: context.context });
    completionGate = { allowed: gate.allowed, reason: gate.reason || null };
    emitCompletionEvent({ id, gateAllowed: gate.allowed, evaluation: evalResult, continuity, completionGate });
  } catch (continuityError) {
    continuity = { status: 'unknown', error: continuityError.message };
    completionGate = { allowed: false, reason: continuityError.message };
  }
  return { continuity, completionGate, evaluation, organism, mission };
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
  const minimal = await checkMinimalShortcut(db);
  if (minimal) return;
  await initializeMission({ db, action, orchestratorId, task });
  const actionContext = buildActionContext({ db, action, request, task, orchestratorId, id, waitForCompletion });
  const handled = await runActionWithCleanup(actionContext, handleAction, state);
  if (handled) {
    emitTopologyEvent(actionContext.orchestratorId, actionContext.action);
    return;
  }

  const nceEnhancements = await applyNceEnhancements(buildNceInput(request), db, orchestratorId);
  const { enhancedPrompt, nceMetadata } = buildEnhancedPrompt(nceEnhancements, task);
  const { strategyContract, missionBudget, useLocalRuntime, requestTimeoutMs, garageDecision, morphology } = await prepareMission({ db, enhancedPrompt, id, policyRequest, request, nceMetadata });
  const workerGarage = require('../src/services/workerGarageService');
  workerGarage.setDynamicCapacity(id, garageDecision.capacity);
  await startOrchestratorMission({ db, strategyContract, missionBudget, useLocalRuntime, requestTimeoutMs, id, enhancedPrompt, policyRequest, request, allowedCommands, allowFileEdits, runtime, morphology });
  const agents = await waitForCompletion(db);
  const { summarizeAgents } = require('../src/services/orchestratorOutcome');
  const outcome = summarizeAgents(agents);
  const result = await evaluateMissionContinuity({ db, id, task, outcome, agents });
  let continuity = result.continuity;
  let completionGate = result.completionGate;
  let evaluation = result.evaluation;
  let organism = result.organism;
  const mission = result.mission;
  const { telemetryRows, runs, coverage } = await gatherTelemetryAndCoverage(db, id);
  const missionSuccess = completionGate.allowed === true;
  let finalVerdict = missionSuccess ? outcome.verdict : (completionGate.allowed === false && outcome.success === true ? 'homeostasis_blocked' : outcome.verdict);

  // Execute morphology (fork agents, topology transitions)
  if (morphology?.agents?.length > 0) {
    const morphoRuntime = require('../src/services/morphogenesis/morphogenesisRuntime').getMorphogenesisRuntime();
    const morphoResult = await morphoRuntime.executeMorphology(morphology, { orchestratorId: id, evidence: outcome.evidence, reason: `post-mission morphogenesis (verdict=${finalVerdict})` });
    telemetry.emitEvent({ eventType: 'MORPHOGENESIS_COMPLETED', agentId: id, action: 'MORPHO_EXECUTED', detail: `Applied ${morphoResult.topology} with ${morphoResult.agents?.length || 0} agents`, payload: { topology: morphoResult.topology, commitId: morphoResult.commitId }, severity: 'info' });
  }

  const contResult = await handleHomeostasisContinuation({ db, id, task, request, mission, completionGate, evaluation, organism, finalVerdict, continuity });
  continuity = contResult.continuity;
  completionGate = contResult.completionGate;
  evaluation = contResult.evaluation;
  organism = contResult.organism;
  finalVerdict = contResult.finalVerdict;
  const finalSuccess = completionGate.allowed === true || finalVerdict === 'completed';

  await persistMissionChampion(db, outcome);
  emitFinalTelemetry({ telemetryRows, runs, coverage, nceEnhancements, missionSuccess: finalSuccess, finalVerdict, continuity, completionGate, id });
  if (!finalSuccess) process.exitCode = 2;
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
  const initDb = await getDatabase();
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
