#!/usr/bin/env node
// MCP-to-backend bridge. It owns one complete GenOS mission, including the
// authority contract and bounded worker fleet, then returns its telemetry.
const path = require('path');
const { spawn } = require('child_process');
const { getDatabase, closeDatabase } = require('../src/db');
const runtime = require('../src/services/agentRuntimeAdapter');
const { createOrchestratorId } = require('../src/services/orchestratorIdFactory');
const contracts = require('../src/services/strategyContractService');
const workerGarage = require('../src/services/workerGarageService');
const aTeamService = require('../src/services/aTeamService');
const trinityService = require('../src/services/trinityService');
const biologicalMode = require('../src/services/biologicalModeService');
const dynamicOrganization = require('../src/services/dynamicOrganizationService');
const telemetry = require('../src/services/telemetryObserver');
const strategyAdaptation = require('../src/services/strategyAdaptationService');
const userProgress = require('../src/services/userProgressService');
const orchestrationCoverage = require('../src/services/orchestrationCoverageService');
const { normalizeAllowedCommands } = require('../src/services/sandboxCommandPolicy');
const { handleAction, handleBackground, initializeMission } = require('./orchestratorActions.cjs');
const { summarizeAgents } = require('../src/services/orchestratorOutcome');
const missionContinuity = require('../src/services/missionContinuityService');

// A stray async DB write (SQLITE_BUSY, closed handle at shutdown, ...) must not
// crash the whole mission: log it and let the mission timeout/finalization run.
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
// A biological strategy hint is a first-class dispatch request. Older MCP
// clients only knew genos_orchestrate and sent { strategy: "biocenose" }, so
// route that shape to the same verified biological handler instead of silently
// dropping the hint and building an unrelated technical contract.
const biologicalModes = new Set(['biome', 'syncytium', 'holobionte', 'biocenose', 'rhizome', 'metapopulation']);
const strategy = String(request.strategy || '').toLowerCase();
const action = request.action || (biologicalModes.has(strategy)
  ? 'dispatch_biological'
  : 'orchestrate');
const task = String(request.mission || request.task || 'Autonomous GenOS orchestration');
let orchestratorId = request.orchestratorId;
let id = action === 'dispatch_worker' ? request.workerId : null;
// Accept the policy at the top level (current schema) and inside `arguments`
// while older long-lived MCP clients refresh their cached tool schema.
const policyRequest = request.arguments && typeof request.arguments === 'object' ? request.arguments : request;
const allowedCommands = normalizeAllowedCommands(policyRequest.allowed_commands) || [];
const allowFileEdits = policyRequest.allow_file_edits === true;

// This bridge creates a root authority boundary. A delegated worker must never
// be able to enter it, even if a globally configured/public GenOS MCP endpoint
// accidentally leaks into the worker's Codex process.
const workerSafeActions = new Set([
  'organization_publish',
  'organization_inbox',
  'organization_state',
  // Philosophy is a bounded registry/query surface; workers must not recurse
  // into orchestration, but may use this read-only MCP action.
  'philosophy'
]);
if (String(process.env.GENOS_EXECUTION_MODE || '').toLowerCase() === 'worker' && !workerSafeActions.has(action)) {
  const owner = process.env.GENOS_ORCHESTRATOR_AGENT_ID || 'its orchestrator';
  const msg = `GenOS worker recursion blocked: delegated workers must return evidence to ${owner}, not create another orchestrator.`;
  process.stderr.write(`[genos-orchestrate] ${msg}\n`);
  process.exitCode = 1;
  process.exit(1);
}

const SCRIPT_START_TIME = Date.now();

async function waitForCompletion(db) {
  const baseTimeout = Number(policyRequest.timeoutMs || request.timeoutMs || 14 * 60 * 1000);
  const deadline = Math.max(Date.now() + 5000, SCRIPT_START_TIME + baseTimeout);
  let pulseTick = 0;
  while (Date.now() < deadline) {
    const agents = await db.all('SELECT id, status FROM agents WHERE id = ? OR parent_agent_id = ?', id, id);
    if (agents.length && agents.every((agent) => ['blocked', 'error', 'terminated', 'apoptosis', 'completed', 'unverified', 'failed', 'quarantined'].includes(agent.status))) return agents;
    // Mission continuity: emit vital pulses every ~5s so the nervous system
    // observes the living fleet while the mission runs.
    pulseTick += 1;
    if (pulseTick % 10 === 0) {
      try { await missionContinuity.observeMissionPulses(db, id); } catch (_) {}
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('GenOS orchestrator timed out');
}

function tokenUsage(runs) {
  const executionRuns = runs.map((run) => {
    let metrics = {}; try { metrics = JSON.parse(run.metrics_json || '{}'); } catch (_) {}
    return { agentId: run.agent_id, status: run.status, tokens: Number(metrics.tokens || 0) };
  });
  return { executionRuns, totalTokens: executionRuns.reduce((sum, run) => sum + run.tokens, 0), allRunsCompleted: executionRuns.length > 0 && executionRuns.every((run) => run.status === 'completed') };
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

async function executeMission(db, state) {
  await initializeMission({ db, action, orchestratorId, task });
  const actionContext = buildActionContext();
  const handled = await runActionWithCleanup(actionContext, state);
  if (handled) return;

  const nceEnhancements = await applyNceEnhancements();
  const { enhancedPrompt, nceMetadata } = buildEnhancedPrompt(nceEnhancements);
  const { strategyContract, missionBudget, useLocalRuntime, requestTimeoutMs } = await prepareMission({ db, enhancedPrompt });
  await startOrchestratorMission({ db, strategyContract, missionBudget, useLocalRuntime, requestTimeoutMs });
  const agents = await waitForCompletion(db);
  const outcome = summarizeAgents(agents);
  const { continuity, completionGate } = await evaluateMissionContinuity({ db, id, task, outcome });
  const { telemetryRows, runs, coverage } = await gatherTelemetryAndCoverage(db, id);
  const missionSuccess = completionGate.allowed === true;
  const finalVerdict = missionSuccess ? outcome.outcome : (completionGate.allowed === false && outcome.success === true ? 'homeostasis_blocked' : outcome.outcome);
  emitFinalTelemetry({ telemetryRows, runs, coverage, nceEnhancements, missionSuccess, finalVerdict, continuity, completionGate });
  if (!missionSuccess) process.exitCode = 2;

  function buildActionContext() {
    return { db, action, request, task, orchestratorId, id, repoRoot: path.resolve(__dirname, '../..'), bridgePath: __filename, waitForCompletion };
  }

  async function runActionWithCleanup(actionContext, state) {
    let handled = false;
    try {
      handled = await handleAction(actionContext);
    } finally {
      if (actionContext.delegatedWorkerId) state.delegatedWorkerId = actionContext.delegatedWorkerId;
      if (actionContext.reusedWorker) state.reusedWorker = true;
    }
    if (handled) {
      emitTopologyEvent(actionContext.orchestratorId);
    }
    return handled;
  }

  function emitTopologyEvent(orchestratorId) {
    const topologyEvent = {
      dispatch_team: ['TOPOLOGY_DISPATCH_ACCEPTED', 'DISPATCH_A_TEAM', 'A-Team topology accepted.'],
      dispatch_trinity: ['TOPOLOGY_DISPATCH_ACCEPTED', 'DISPATCH_TRINITY', 'Trinity topology accepted.'],
      dispatch_biological: ['BIOLOGICAL_MISSION_COMPLETED', 'COMPLETE_BIOLOGICAL_MODE', 'Biological topology completed.']
    }[action];
    if (topologyEvent) telemetry.emitEvent({ eventType: topologyEvent[0], agentId: orchestratorId, action: topologyEvent[1], detail: topologyEvent[2], payload: { action }, severity: 'info' });
  }

  async function applyNceEnhancements() {
    const nceIntegration = require('../src/services/nceIntegrationService');
    const nceInput = buildNceInput();
    try {
      return await nceIntegration.enhanceMissionWithNCE(nceInput, db);
    } catch (nceErr) {
      telemetry.emitEvent({ eventType: 'NCE_ENHANCEMENT_ERROR', agentId: orchestratorId, action: 'NCE_SKIPPED', detail: nceErr.message, severity: 'warn' });
      return {};
    }
  }

  function buildNceInput() {
    const get = (obj, ...keys) => {
      for (const k of keys) {
        const v = obj?.[k];
        if (v !== undefined && v !== null) return v;
      }
      return undefined;
    };
    return {
      prompt: task,
      domain: get(request, 'domain', 'problem_domain'),
      keywords: request.keywords || [],
      budget: get(request, 'executionBudget', 'execution_budget') || {},
      explorationDomains: get(request, 'exploration_domains', 'explorationDomains'),
      knownConcepts: get(request, 'known_concepts', 'knownConcepts'),
      existingCapabilities: get(request, 'existing_capabilities', 'existingCapabilities'),
      genome: get(request, 'agent_dna', 'agentDna'),
      environment: get(request, 'environment_context', 'environmentContext'),
      culturalTraits: get(request, 'cultural_traits', 'culturalTraits'),
      nceOptions: get(request, 'nce_options', 'nceOptions'),
    };
  }

  function buildEnhancedPrompt(nceEnhancements) {
    const { buildPromptEnrichment, hasResult } = require('../src/services/ncePromptService');
    let enhancedPrompt = task;
    const nceMetadata = {};
    if (nceEnhancements && Object.keys(nceEnhancements).length > 0) {
      const promptAdditions = buildPromptEnrichment(nceEnhancements);
      if (promptAdditions) enhancedPrompt = task + promptAdditions;
      if (hasResult(nceEnhancements.curiosity)) nceMetadata.curiosity = nceEnhancements.curiosity.selectedDomainId;
      if (hasResult(nceEnhancements.representations)) nceMetadata.representations = nceEnhancements.representations.length;
      if (hasResult(nceEnhancements.exaptations)) nceMetadata.exaptations = nceEnhancements.exaptations.length;
      if (hasResult(nceEnhancements.environments)) nceMetadata.environments = nceEnhancements.environments.length;
      if (hasResult(nceEnhancements.culturalTraits)) nceMetadata.culturalTraits = nceEnhancements.culturalTraits.length;
    }
    return { enhancedPrompt, nceMetadata };
  }

  async function prepareMission(options = {}) {
    const { db, enhancedPrompt } = options;
    await db.run(`INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, model_tier, isolation_mode, current_task) VALUES (?, 'MCP GenOS Orchestrator', 'Autonomous Orchestrator', 'idle', 'orchestrator', 'frontier', 'Branch', ?)`, id, enhancedPrompt);
    await db.run(`UPDATE agents SET status = 'idle', is_apoptotic = 0, current_task = ?, metadata_json = COALESCE(metadata_json, '{}') WHERE id = ?`, enhancedPrompt, id);
    const strategyContract = await contracts.saveContract(db, { agentId: id, problem: task, createdBy: 'mcp_orchestrate' });
    const requestTimeoutMs = policyRequest.timeoutMs || request.timeoutMs;
    const missionBudget = { ...(policyRequest.executionBudget || policyRequest.execution_budget || {}) };
    applyLatencyBudget(missionBudget, requestTimeoutMs);
    const useLocalRuntime = checkLocalRuntime();
    return { strategyContract, missionBudget, useLocalRuntime, requestTimeoutMs };
  }

  function applyLatencyBudget(budget, timeoutMs) {
    if (timeoutMs && !budget.latencyMs) {
      budget.latencyMs = Math.max(1000, Number(timeoutMs) - 4000);
    }
  }

  function checkLocalRuntime() {
    const executor = String(policyRequest.executor || request.executor || '').trim().toLowerCase();
    return executor === 'local' || policyRequest.local_runtime === true
      || /^(1|true)$/i.test(String(process.env.GENOS_ORCHESTRATOR_LOCAL || ''))
      || String(process.env.GENOS_AGENT_EXECUTOR || '').trim().toLowerCase() === 'local';
  }

  async function startOrchestratorMission(options = {}) {
    const { db, strategyContract, missionBudget, useLocalRuntime, requestTimeoutMs } = options;
    await runtime.startMission({ agentId: id, name: 'MCP GenOS Orchestrator', role: 'Autonomous Orchestrator', prompt: enhancedPrompt, modelTier: 'frontier', strategyContract: strategyContract.contract, executionBudget: missionBudget, executionPolicy: { allowedCommands, allowFileEdits }, silentUpdates: policyRequest.silent_updates === true, autonomousOrchestration: policyRequest.autonomous_orchestration !== false, timeoutMs: requestTimeoutMs, executor: policyRequest.executor || request.executor || (useLocalRuntime ? 'local' : undefined), provider: policyRequest.provider || request.provider });
  }

  async function evaluateMissionContinuity(options = {}) {
    const { db, id, task, outcome } = options;
    let continuity = null;
    let completionGate = { allowed: false, reason: 'continuity evaluation did not run' };
    try {
      const context = buildMissionContext(outcome);
      const mission = missionContinuity.buildMissionInput(id, task, {
        completionContract: context.completionContract,
        invariants: context.invariants,
        safetyConstraints: context.safetyConstraints,
        context: context.context
      });
      const evaluation = await missionContinuity.evaluateContinuity(db, mission);
      continuity = buildContinuity(evaluation);
      const gate = await missionContinuity.transitionMissionToComplete(db, { organism: evaluation.organism, mission, context: context.context });
      completionGate = { allowed: gate.allowed, reason: gate.reason || null };
      emitCompletionEvent({ id, gateAllowed: gate.allowed, evaluation, continuity, completionGate });
    } catch (continuityError) {
      continuity = { status: 'unknown', error: continuityError.message };
      completionGate = { allowed: false, reason: continuityError.message };
    }
    return { continuity, completionGate };
  }

  function buildMissionContext(outcome) {
    return {
      completionContract: policyRequest.completionContract || request.completionContract || null,
      invariants: policyRequest.invariants || request.invariants || null,
      safetyConstraints: policyRequest.safetyConstraints || request.safetyConstraints || null,
      context: {
        missionOutcome: outcome.success === true,
        flags: { missionOutcome: outcome.success === true, testsPassed: outcome.success === true },
        evidence: outcome.success === true ? ['mission_outcome'] : [],
        functionalChecks: outcome.functionalChecks || {},
        structuralChecks: outcome.structuralChecks || {}
      }
    };
  }

  function buildContinuity(evaluation) {
    return {
      status: evaluation.status,
      homeostasisSatisfied: evaluation.state.homeostasisSatisfied,
      missingEvidence: evaluation.state.evidence ? evaluation.state.evidence.missing : [],
      failedInvariants: evaluation.state.failedInvariants.map((f) => f.label || f.id)
    };
  }

  function emitCompletionEvent({ id, gateAllowed, evaluation, continuity, completionGate }) {
    telemetry.emitEvent({
      eventType: gateAllowed ? 'MISSION_COMPLETED' : 'MISSION_COMPLETION_BLOCKED',
      agentId: id,
      action: gateAllowed ? 'COMPLETE' : 'COMPLETION_GATE',
      detail: gateAllowed
        ? 'Mission homeostasis satisfied: completion authorized.'
        : `Completion blocked by homeostasis gate: ${evaluation.status}`,
      payload: { ...continuity, completionGate },
      sessionId: id,
      severity: gateAllowed ? 'info' : 'warning'
    });
  }

  async function gatherTelemetryAndCoverage(db, id) {
    const telemetryRows = await db.all('SELECT event_type, action, detail, severity, payload_json FROM telemetry_events WHERE agent_id = ? OR agent_id IN (SELECT id FROM agents WHERE parent_agent_id = ?) ORDER BY created_at', id, id);
    const runs = await db.all('SELECT agent_id, status, metrics_json FROM strategy_execution_runs WHERE agent_id = ? OR agent_id IN (SELECT id FROM agents WHERE parent_agent_id = ?) ORDER BY created_at', id, id);
    const coverage = await orchestrationCoverage.auditMission(db, id).catch((err) => ({ error: err.message, verdict: 'audit-incomplete' }));
    telemetry.emitEvent({ eventType: 'ORCHESTRATION_AUDIT_COMPLETED', agentId: id, action: 'COVERAGE_AUDIT', detail: `Orchestration coverage verdict: ${coverage.verdict}`, severity: 'info', payload: { observedTools: coverage.protocol?.observedCount || 0, verdict: coverage.verdict } });
    return { telemetryRows, runs, coverage };
  }

  function emitFinalTelemetry(options = {}) {
    const { telemetryRows, runs, coverage, nceEnhancements, missionSuccess, finalVerdict, continuity, completionGate } = options;
    const nceInfo = buildNceInfo(nceEnhancements);
    process.stdout.write(JSON.stringify({ orchestratorId: id, agents, success: missionSuccess, verdict: finalVerdict, completionGate, continuity, telemetry: telemetryRows, nce: nceInfo, token_usage: tokenUsage(runs), coverage }));
  }

  function buildNceInfo(nceEnhancements) {
    return {
      enhancementsApplied: Object.keys(nceEnhancements).filter((k) => nceEnhancements[k] && k !== 'error').length,
      curiousDomains: nceEnhancements.curiousDomains?.length || 0,
      representations: nceEnhancements.representations?.length || 0,
      exaptations: nceEnhancements.exaptations?.length || 0,
      environments: nceEnhancements.environmentPopulation?.length || 0
    };
  }
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
