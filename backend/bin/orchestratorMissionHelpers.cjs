'use strict';

const path = require('path');
const telemetry = require('../src/services/telemetryObserver');
const { summarizeAgents } = require('../src/services/orchestratorOutcome');
const orchestrationCoverage = require('../src/services/orchestrationCoverageService');
const missionContinuity = require('../src/services/missionContinuityService');
const { decideGarageCapacity } = require('../src/services/garageCapacityService');

function buildActionContext(ctx) {
  return {
    db: ctx.db,
    action: ctx.action,
    request: ctx.request,
    task: ctx.task,
    orchestratorId: ctx.orchestratorId,
    id: ctx.id,
    repoRoot: path.resolve(__dirname, '../..'),
    bridgePath: __filename,
    waitForCompletion: ctx.waitForCompletion
  };
}

async function runActionWithCleanup(actionContext, handleAction, state) {
  let handled = false;
  try {
    handled = await handleAction(actionContext);
  } finally {
    if (actionContext.delegatedWorkerId) state.delegatedWorkerId = actionContext.delegatedWorkerId;
    if (actionContext.reusedWorker) state.reusedWorker = true;
  }
  if (handled) {
    emitTopologyEvent(actionContext.orchestratorId, actionContext.action);
  }
  return handled;
}

function emitTopologyEvent(orchestratorId, action) {
  const topologyEvent = {
    dispatch_team: ['TOPOLOGY_DISPATCH_ACCEPTED', 'DISPATCH_A_TEAM', 'A-Team topology accepted.'],
    dispatch_trinity: ['TOPOLOGY_DISPATCH_ACCEPTED', 'DISPATCH_TRINITY', 'Trinity topology accepted.'],
    dispatch_biological: ['BIOLOGICAL_MISSION_COMPLETED', 'COMPLETE_BIOLOGICAL_MODE', 'Biological topology completed.']
  }[action];
  if (topologyEvent) telemetry.emitEvent({ eventType: topologyEvent[0], agentId: orchestratorId, action: topologyEvent[1], detail: topologyEvent[2], payload: { action }, severity: 'info' });
}

async function applyNceEnhancements(nceInput, db, orchestratorId) {
  const nceIntegration = require('../src/services/nceIntegrationService');
  try {
    return await nceIntegration.enhanceMissionWithNCE(nceInput, db);
  } catch (nceErr) {
    telemetry.emitEvent({ eventType: 'NCE_ENHANCEMENT_ERROR', agentId: orchestratorId, action: 'NCE_SKIPPED', detail: nceErr.message, severity: 'warn' });
    return {};
  }
}

function pickOr(obj, keys, fallback) {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null) return v;
  }
  return fallback;
}

function resolveWorkspacePath(request) {
  return pickOr(request, ['workspacePath', 'workspace_path']);
}

function resolveWorkspaceId(request) {
  return pickOr(request, ['workspaceId', 'workspace_id']);
}

function buildNceInput(request) {
  return {
    prompt: pickOr(request, ['mission', 'task'], 'Autonomous GenOS orchestration'),
    domain: pickOr(request, ['domain', 'problem_domain']),
    keywords: pickOr(request, ['keywords'], []),
    budget: pickOr(request, ['executionBudget', 'execution_budget'], {}),
    explorationDomains: pickOr(request, ['exploration_domains', 'explorationDomains']),
    knownConcepts: pickOr(request, ['known_concepts', 'knownConcepts']),
    existingCapabilities: pickOr(request, ['existing_capabilities', 'existingCapabilities']),
    genome: pickOr(request, ['agent_dna', 'agentDna']),
    environment: pickOr(request, ['environment_context', 'environmentContext']),
    culturalTraits: pickOr(request, ['cultural_traits', 'culturalTraits']),
    nceOptions: pickOr(request, ['nce_options', 'nceOptions']),
    workspacePath: resolveWorkspacePath(request),
    workspaceId: resolveWorkspaceId(request),
    agentId: request.agentId,
  };
}

function buildEnhancedPrompt(nceEnhancements, task) {
  const { buildPromptEnrichment, hasResult } = require('../src/services/ncePromptService');
  let enhancedPrompt = task;
  const nceMetadata = {};
  if (nceEnhancements && Object.keys(nceEnhancements).length > 0) {
    const promptAdditions = buildPromptEnrichment(nceEnhancements);
    if (promptAdditions) enhancedPrompt = task + promptAdditions;
    if (hasResult(nceEnhancements.curiosity?.ranking)) nceMetadata.curiosity = nceEnhancements.curiosity.selectedDomainId;
    if (hasResult(nceEnhancements.representations)) nceMetadata.representations = nceEnhancements.representations.length;
    if (hasResult(nceEnhancements.exaptations)) nceMetadata.exaptations = nceEnhancements.exaptations.length;
    if (hasResult(nceEnhancements.environments)) nceMetadata.environments = nceEnhancements.environments.length;
    if (hasResult(nceEnhancements.culturalTraits)) nceMetadata.culturalTraits = nceEnhancements.culturalTraits.length;
  }
  return { enhancedPrompt, nceMetadata };
}

function mergeMetadataJson(existing, nceMetadata) {
  let metadataJson = existing || '{}';
  try {
    const parsed = JSON.parse(metadataJson);
    if (nceMetadata && typeof nceMetadata === 'object' && Object.keys(nceMetadata).length > 0) {
      metadataJson = JSON.stringify({ ...parsed, nceMetadata });
    }
  } catch (_) { /* garder l'existant */ }
  return metadataJson;
}

async function prepareMission(opts) {
  const { db, enhancedPrompt, id, policyRequest, request, nceMetadata } = opts;
  const contracts = require('../src/services/strategyContractService');
  const existing = await db.get(`SELECT metadata_json FROM agents WHERE id = ?`, id).catch(() => null);
  const metadataJson = mergeMetadataJson(existing?.metadata_json, { nceMetadata });
  await db.run(`INSERT OR IGNORE INTO agents (id, name, role, status, execution_mode, model_tier, isolation_mode, current_task, metadata_json) VALUES (?, 'MCP GenOS Orchestrator', 'Autonomous Orchestrator', 'idle', 'orchestrator', 'frontier', 'Branch', ?, ?)`, id, enhancedPrompt, metadataJson);
  await db.run(`UPDATE agents SET status = 'idle', is_apoptotic = 0, current_task = ?, metadata_json = ? WHERE id = ?`, enhancedPrompt, metadataJson, id);
  const strategyContract = await contracts.saveContract(db, { agentId: id, problem: enhancedPrompt, createdBy: 'mcp_orchestrate' });
  const garageDecision = decideGarageCapacity({ contract: strategyContract.contract, topology: request.action });
  await db.run(`UPDATE agents SET metadata_json = ? WHERE id = ?`, mergeMetadataJson(metadataJson, { garageCapacity: garageDecision.capacity, garageDecision }), id);
  const requestTimeoutMs = policyRequest.timeoutMs || request.timeoutMs;
  const missionBudget = { ...(policyRequest.executionBudget || policyRequest.execution_budget || request.executionBudget || request.execution_budget || {}) };
  applyLatencyBudget(missionBudget, requestTimeoutMs);
  const useLocalRuntime = checkLocalRuntime(policyRequest, request);
  return { strategyContract, missionBudget, useLocalRuntime, requestTimeoutMs, garageDecision };
}

function applyLatencyBudget(budget, timeoutMs) {
  if (timeoutMs && !budget.latencyMs) {
    budget.latencyMs = Math.max(1000, Number(timeoutMs) - 4000);
  }
}

function checkLocalRuntime(policyRequest, request) {
  const executor = String(policyRequest.executor || request.executor || '').trim().toLowerCase();
  return executor === 'local' || policyRequest.local_runtime === true
    || /^(1|true)$/i.test(String(process.env.GENOS_ORCHESTRATOR_LOCAL || ''))
    || String(process.env.GENOS_AGENT_EXECUTOR || '').trim().toLowerCase() === 'local';
}

async function startOrchestratorMission(opts) {
  const { db, strategyContract, missionBudget, useLocalRuntime, requestTimeoutMs, id, enhancedPrompt, policyRequest, request, allowedCommands, allowFileEdits, runtime } = opts;
  await runtime.startMission({ agentId: id, name: 'MCP GenOS Orchestrator', role: 'Autonomous Orchestrator', prompt: enhancedPrompt, modelTier: 'frontier', strategyContract: strategyContract.contract, executionBudget: missionBudget, executionPolicy: { allowedCommands, allowFileEdits }, silentUpdates: policyRequest.silent_updates === true, autonomousOrchestration: policyRequest.autonomous_orchestration !== false, timeoutMs: requestTimeoutMs, executor: policyRequest.executor || request.executor || (useLocalRuntime ? 'local' : undefined), provider: policyRequest.provider || request.provider });
}

const { buildMissionContext } = require('./orchestratorMissionHelpersBuildContext.cjs');

function buildContinuity(evaluation) {
  return {
    status: evaluation.status,
    homeostasisSatisfied: evaluation.state.homeostasisSatisfied,
    missingEvidence: evaluation.state.evidence ? evaluation.state.evidence.missing : [],
    failedInvariants: evaluation.state.failedInvariants.map((f) => f.label || f.id)
  };
}

function emitCompletionEvent(opts) {
  const { id, gateAllowed, evaluation, continuity, completionGate } = opts;
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

function emitFinalTelemetry(opts) {
  const { telemetryRows, runs, coverage, nceEnhancements, missionSuccess, finalVerdict, continuity, completionGate, id } = opts;
  const nceInfo = buildNceInfo(nceEnhancements);
  process.stdout.write(JSON.stringify({ orchestratorId: id, success: missionSuccess, verdict: finalVerdict, completionGate, continuity, telemetry: telemetryRows, nce: nceInfo, token_usage: tokenUsage(runs), coverage }));
}

function buildNceInfo(nceEnhancements) {
  return {
    enhancementsApplied: Object.keys(nceEnhancements).filter((k) => nceEnhancements[k] && k !== 'error').length,
    curiosityRanking: nceEnhancements.curiosity?.ranking?.length || 0,
    representations: nceEnhancements.representations?.length || 0,
    exaptations: nceEnhancements.exaptations?.length || 0,
    environments: nceEnhancements.environments?.length || 0
  };
}

function tokenUsage(runs) {
  const executionRuns = runs.map((run) => {
    let metrics = {}; try { metrics = JSON.parse(run.metrics_json || '{}'); } catch (_) {}
    return { agentId: run.agent_id, status: run.status, tokens: Number(metrics.tokens || 0) };
  });
  return { executionRuns, totalTokens: executionRuns.reduce((sum, run) => sum + run.tokens, 0), allRunsCompleted: executionRuns.length > 0 && executionRuns.every((run) => run.status === 'completed') };
}

module.exports = {
  buildActionContext,
  runActionWithCleanup,
  emitTopologyEvent,
  applyNceEnhancements,
  buildNceInput,
  buildEnhancedPrompt,
  mergeMetadataJson,
  prepareMission,
  applyLatencyBudget,
  checkLocalRuntime,
  startOrchestratorMission,
  buildMissionContext,
  buildContinuity,
  emitCompletionEvent,
  gatherTelemetryAndCoverage,
  emitFinalTelemetry,
  buildNceInfo,
  tokenUsage
};
