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
  const requested = requestedModel(request);
  const localModel = /^[a-z][a-z0-9+.-]*:\/\//i.test(requested) ? requested : `ollama://${requested}`;
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
    deferAgentTerminalStatus: true,
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

async function runWindowsLocalRosterExecution(input, dependencies) {
  const { db, id, missionId, autonomyPlan, request, requestTimeoutMs, enhancedPrompt } = input;
  const assignments = autonomyPlan.dispatchWorkers || [];
  const exact = autonomyPlan.workerRoster?.exact === true;
  const expected = exact ? autonomyPlan.workerRoster.requestedWorkers : assignments.length;
  if (assignments.length !== expected) {
    throw Object.assign(new Error('Windows local execution cannot dispatch an incomplete exact worker roster.'), {
      code: 'WORKER_CARDINALITY_UNSATISFIABLE', requestedWorkers: expected,
      selectedWorkers: assignments.length
    });
  }
  const createWorkers = dependencies.createAutonomousWorkers || require('../src/services/agentFleetService').createAutonomousWorkers;
  const workers = await createWorkers(db, { id, agent_type: 'orchestrator' }, {
    plan: autonomyPlan, mission: { ...request, missionId, prompt: enhancedPrompt, workspaceRoot: requestedWorkspace(request) }
  });
  if (workers.length !== expected) {
    throw Object.assign(new Error('Windows local worker creation did not match the planned roster.'), {
      code: 'WORKER_CARDINALITY_UNSATISFIABLE', requestedWorkers: assignments.length, createdWorkers: workers.length
    });
  }
  const runResults = await Promise.all(workers.map((worker, index) => runWindowsRosterWorker({
    input, worker, assignment: assignments[index], index, dependencies
  })));
  await runWindowsRosterPostflight({ input, workers, runResults, dependencies });
  if (runResults.some((result) => !result.started || result.unresolved === true)) {
    throw Object.assign(new Error('At least one Windows local worker did not complete with a resolved result.'), {
      code: 'WINDOWS_LOCAL_WORKER_INCOMPLETE', workerResults: runResults
    });
  }
  const agents = workers.map((worker) => ({ id: worker.agentId, status: 'completed', execution_mode: 'worker',
    runtime_pid: null, latest_run_status: 'completed' }));
  const outcome = require('../src/services/orchestratorOutcome').summarizeAgents(agents);
  const evaluation = await input.evaluateMissionContinuity({ db, id, task: input.task, outcome, agents });
  const audit = await input.gatherTelemetryAndCoverage(db, id);
  await input.finalizeOrchestratedMission({ db, outcome, evaluation, morphology: input.morphology,
    morphologySnapshot: null, nceEnhancements: input.nceEnhancements, audit, deferredAgentTerminalStatus: true });
  return true;
}

async function runWindowsRosterPostflight(context) {
  const { input, workers, runResults, dependencies } = context;
  const runPostflight = dependencies.runPostflight || require('./orchestratorMcpPreflight.cjs').runOrchestratorMcpPostflight;
  for (const [index, worker] of workers.entries()) {
    try {
      await runPostflight({ db: input.db, orchestratorId: input.id, workerAgentId: worker.agentId,
        missionId: input.missionId, task: input.task, repoRoot: path.resolve(__dirname, '../..'),
        workspaceRoot: requestedWorkspace(input.request), preflight: input.preflight,
        localResult: runResults[index], workerElapsedMs: runResults[index].elapsedMs || 0 });
    } catch (error) {
      require('../src/services/telemetryObserver').emitEvent({ eventType: 'ORCHESTRATOR_POSTFLIGHT_FAILED',
        agentId: input.id, action: error.tool || error.code || 'POSTFLIGHT', detail: error.message,
        severity: 'warning', payload: { missionId: input.missionId, workerAgentId: worker.agentId,
          code: error.code || null, tool: error.tool || null } });
    }
  }
}

async function runWindowsRosterWorker(context) {
  const { input, worker, assignment, index, dependencies } = context;
  const { db, id, missionId, requestTimeoutMs, allowedCommands, allowFileEdits } = input;
  const executionRunId = `local-direct-${worker.agentId}`;
  const budget = { ...worker.executionBudget, latencyMs: worker.executionBudget?.latencyMs || Math.max(1000, Number(requestTimeoutMs) - 4000) };
  await db.run(`INSERT OR IGNORE INTO strategy_execution_runs (id, agent_id, status, metrics_json) VALUES (?, ?, 'running', '{}')`, executionRunId, worker.agentId);
  const scope = dependencies.validScope({ id: `execution-run:${executionRunId}`, costUsd: Number(budget.costUsd || 0), tokens: Number(budget.tokens || 0) });
  await persistLocalBudgetScope(db, scope, executionRunId, worker.agentId);
  const mission = buildLocalMission({ ...input, id: worker.agentId, missionId, orchestratorAgentId: id,
    enhancedPrompt: worker.prompt || `${input.enhancedPrompt}\n\nAssignment ${index + 1}: ${assignment.hypothesis || assignment.role}`,
    missionBudget: budget, request: { ...input.request, localModel: worker.localModel || input.request.localModel,
      workspaceRoot: worker.workspaceRoot, workerKind: assignment.workerKind, role: assignment.role,
      identityExperimentScenario: undefined }, allowedCommands, allowFileEdits });
  mission.workerKind = assignment.workerKind;
  mission.role = assignment.role;
  mission.modelBudgetScope = scope;
  const startedAt = Date.now();
  const result = await dependencies.runLocalWorker(db, mission, { id: executionRunId });
  return { ...result, elapsedMs: Date.now() - startedAt };
}

async function persistLocalBudgetScope(db, scope, executionRunId, agentId) {
  await db.run(`INSERT OR IGNORE INTO mission_model_budget_scopes
    (scope_id, parent_run_id, parent_agent_id, organization_id, project_id, cost_ceiling_usd, token_ceiling)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, scope.id, executionRunId, agentId, null, null, scope.costUsd, scope.tokens);
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
async function runWindowsLocalExecution(input, dependencies = {}) {
  const { db, id, missionId, task, enhancedPrompt, request, missionBudget,
    requestTimeoutMs, allowedCommands, allowFileEdits, morphology,
    nceEnhancements, evaluateMissionContinuity, gatherTelemetryAndCoverage,
    finalizeOrchestratedMission, preflight } = input;
  process.stderr.write('[genos-orchestrate] Windows detected: using in-process local-model execution to avoid worker pipe EPIPE.\n');
  const runLocalWorker = dependencies.runLocalWorker || require('../src/services/workerEvidenceBarrierLocal').runLocalWorker;
  const validScope = dependencies.validScope || require('../src/services/missionModelBudgetScope').validScope;
  if ((input.autonomyPlan?.dispatchWorkers || []).length > 1) {
    return runWindowsLocalRosterExecution(input, { runLocalWorker, validScope,
      createAutonomousWorkers: dependencies.createAutonomousWorkers,
      runPostflight: dependencies.runPostflight });
  }

  // Le fallback est in-process : utiliser l'agent orchestrateur persisté pour que
  // la récupération et les décisions d'organisation puissent résoudre son identité.
  const orchestratorAgentId = id;
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
  const workerStartedAt = Date.now();
  const localResult = await runLocalWorker(db, localMission, { id: executionRunId });
  let postflight = { observedTools: [], receipts: [] };
  try {
    postflight = await require('./orchestratorMcpPreflight.cjs').runOrchestratorMcpPostflight({
      db, orchestratorId: id, missionId, task,
      repoRoot: path.resolve(__dirname, '../..'),
      workspaceRoot: requestedWorkspace(request), preflight, localResult,
      workerElapsedMs: Date.now() - workerStartedAt
    });
  } catch (error) {
    require('../src/services/telemetryObserver').emitEvent({
      eventType: 'ORCHESTRATOR_POSTFLIGHT_FAILED', agentId: id, action: error.tool || error.code || 'POSTFLIGHT',
      detail: error.message, severity: 'warning',
      payload: { missionId, executionRunId, code: error.code || null, tool: error.tool || null,
        observedTools: postflight.observedTools }
    });
  }
  const agents = localAgents(id, localResult);
  const outcome = require('../src/services/orchestratorOutcome').summarizeAgents(agents);
  const evaluation = await evaluateMissionContinuity({ db, id, task, outcome, agents });
  const audit = await gatherTelemetryAndCoverage(db, id);
  await finalizeOrchestratedMission({ db, outcome, evaluation, morphology, morphologySnapshot: null, nceEnhancements, audit,
    deferredAgentTerminalStatus: true });
  return true;
}

module.exports = { runWindowsLocalExecution, buildLocalMission, runWindowsLocalRosterExecution };
