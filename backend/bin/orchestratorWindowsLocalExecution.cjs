'use strict';

const path = require('path');

function requestedCodeWorker(request) {
  return request.local_code_worker === true || request.localCodeWorker === true;
}

function requestedWorkspace(request) {
  return request.workspaceRoot || request.workspace_root || process.env.GENOS_WORKSPACE_ROOT
    || path.resolve(__dirname, '../..');
}

function requestedModel(request) {
  return request.localModel || request.local_model || request.modelId || request.model_id || process.env.GENOS_LOCAL_MODEL
    || process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';
}

function resolveIdentity(request) {
  const identityExperimentArm = request.identityExperimentArm || request.identity_experiment_arm || null;
  const requestedScenario = request.identityExperimentScenario || request.identity_experiment_scenario || null;
  const identityExperimentScenario = identityExperimentArm
    && ['A', 'B', 'C'].includes(requestedScenario) ? requestedScenario : null;
  const identityExperimentWorker = Boolean(identityExperimentScenario);
  const allowedEvidenceRefs = ['mission'];
  if (identityExperimentArm === 'genos_full') allowedEvidenceRefs.push('worker_self');
  if (identityExperimentArm === 'identity_sheet') allowedEvidenceRefs.push('identity_sheet');
  return { identityExperimentArm, identityExperimentScenario, identityExperimentWorker, allowedEvidenceRefs,
    identityExperimentSeed: Number.isInteger(request.identityExperimentSeed) ? request.identityExperimentSeed : undefined };
}

function resolveRouting(request, localModel) {
  if (request.localRoutingPolicy || request.local_routing_policy) {
    return request.localRoutingPolicy || request.local_routing_policy;
  }
  const primary = localModel.startsWith('ollama://') ? localModel : 'ollama://' + localModel;
  return { primary, fallbacks: [], parallelReview: [], mode: 'fallback', preferLocal: true };
}

function resolveBudget(missionBudget, requestTimeoutMs) {
  const timeoutBudget = Math.max(1000, Number(requestTimeoutMs) - 4000);
  return { ...missionBudget, tokens: missionBudget.tokens || 8192,
    costUsd: missionBudget.costUsd || 0, latencyMs: missionBudget.latencyMs || timeoutBudget };
}

function buildLocalMission(input) {
  const { id, missionId, enhancedPrompt, request, missionBudget,
    requestTimeoutMs, allowedCommands, allowFileEdits, orchestratorAgentId } = input;
  const localCodeWorker = requestedCodeWorker(request);
  const localModel = requestedModel(request);
  const identity = resolveIdentity(request);
  const prompt = String(enhancedPrompt || '').replaceAll('{{AGENT_ID}}', String(id));
  const workerKind = identity.identityExperimentWorker ? 'specialist' : 'bounded_worker';
  const specialtyNiche = identity.identityExperimentWorker
    ? 'identity continuity and causal self-model analysis' : undefined;
  return { agentId: id, orchestratorAgentId: orchestratorAgentId || null, missionId: missionId || id,
    prompt, currentTask: prompt, role: 'implementation',
    workerKind, specialtyNiche,
    identityExperimentScenario: identity.identityExperimentScenario,
    executionMode: 'worker',
    workspaceRoot: requestedWorkspace(request), workspaceProvisioned: true,
    writeLease: allowFileEdits, localCodeWorker, allowedEvidenceRefs: identity.allowedEvidenceRefs,
    localModel, localRoutingPolicy: resolveRouting(request, localModel),
    identityExperimentArm: identity.identityExperimentArm,
    identityExperimentSeed: identity.identityExperimentSeed,
    timeoutMs: requestTimeoutMs, executionBudget: resolveBudget(missionBudget, requestTimeoutMs),
    executionPolicy: { allowedCommands, allowFileEdits, localCodeWorker },
    requiredPatchPaths: request.requiredPatchPaths,
    requiredPatchMarkers: request.requiredPatchMarkers,
    requiredPatchMinimumBytes: request.requiredPatchMinimumBytes };
}

function localAgents(id, result) {
  const completed = result.started && result.unresolved !== true;
  return [{ id, status: completed ? 'completed' : (result.unresolved ? 'unverified' : 'error'),
    execution_mode: 'worker', runtime_pid: null,
    latest_run_status: completed ? 'completed' : 'failed' }];
}

/**
 * Exécution in-process de la mission sur Windows.
 * Évite le spawn de processus enfant (pipes stdin/stdout) qui échoue avec
 * EPIPE (broken pipe) sur cette plateforme. Le worker contacte le modèle
 * local (ollama) directement via runLocalWorker.
 */
async function runWindowsLocalExecution(input) {
  const { db, id, missionId, task, enhancedPrompt, request, missionBudget,
    requestTimeoutMs, allowedCommands, allowFileEdits, morphology,
    nceEnhancements, evaluateMissionContinuity, gatherTelemetryAndCoverage,
    finalizeOrchestratedMission } = input;
  process.stderr.write('[genos-orchestrate] Windows detected: using in-process local-model execution to avoid worker pipe EPIPE.\n');
  const { runLocalWorker } = require('../src/services/workerEvidenceBarrierLocal');
  const { validScope } = require('../src/services/missionModelBudgetScope');

  // Identité d'orchestrateur distincte : le worker ne doit pas être son propre parent.
  const orchestratorAgentId = 'windows-orchestrator-' + id;
  const executionRunId = 'local-direct-' + id;

  // Persister la course d'exécution pour que la portée budgétaire puisse y faire référence.
  await db.run(`INSERT OR IGNORE INTO strategy_execution_runs (id, agent_id, status, metrics_json)
    VALUES (?, ?, 'running', '{}')`, executionRunId, orchestratorAgentId);

  // Créer et persister la portée de budget modèle parent depuis le budget déclaré.
  const budget = { ...missionBudget, tokens: missionBudget.tokens || 8192,
    costUsd: missionBudget.costUsd || 0,
    latencyMs: missionBudget.latencyMs || Math.max(1000, Number(requestTimeoutMs) - 4000) };
  const scope = validScope({
    id: `execution-run:${executionRunId}`,
    costUsd: Number(budget.costUsd),
    tokens: Number(budget.tokens)
  });
  await db.run(`INSERT OR IGNORE INTO mission_model_budget_scopes
    (scope_id, parent_run_id, parent_agent_id, organization_id, project_id,
     cost_ceiling_usd, token_ceiling) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    scope.id, executionRunId, orchestratorAgentId, null, null,
    scope.costUsd, scope.tokens);

  const localMission = buildLocalMission({ ...input, orchestratorAgentId });
  localMission.modelBudgetScope = scope;
  const localResult = await runLocalWorker(db, localMission, { id: executionRunId });
  const agents = localAgents(id, localResult);
  const outcome = require('../src/services/orchestratorOutcome').summarizeAgents(agents);
  const evaluation = await evaluateMissionContinuity({ db, id, task, outcome, agents });
  const audit = await gatherTelemetryAndCoverage(db, id);
  await finalizeOrchestratedMission({ db, outcome, evaluation, morphology, morphologySnapshot: null, nceEnhancements, audit });
  return true;
}

module.exports = { runWindowsLocalExecution, buildLocalMission };
