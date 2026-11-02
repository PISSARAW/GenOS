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
  return { ...missionBudget, tokens: missionBudget.tokens ?? 8192,
    costUsd: missionBudget.costUsd ?? 0, latencyMs: missionBudget.latencyMs ?? timeoutBudget };
}

function resolveWorkerKind(request, identity) {
  if (request.workerKind) return request.workerKind;
  return identity.identityExperimentWorker ? 'specialist' : 'bounded_worker';
}

function resolveWorkerRole(request, workerKind) {
  if (request.role) return request.role;
  return workerKind === 'creative_worker' ? 'creative_author' : 'implementation';
}

function buildLocalMission(input) {
  const { id, missionId, enhancedPrompt, request, missionBudget,
    requestTimeoutMs, allowedCommands, allowFileEdits, orchestratorAgentId } = input;
  const localCodeWorker = requestedCodeWorker(request);
  const requested = requestedModel(request);
  const localModel = /^[a-z][a-z0-9+.-]*:\/\//i.test(requested) ? requested : `ollama://${requested}`;
  const identity = resolveIdentity(request);
  const prompt = String(enhancedPrompt || '').replaceAll('{{AGENT_ID}}', String(id));
  const workerKind = resolveWorkerKind(request, identity);
  const specialtyNiche = identity.identityExperimentWorker
    ? 'identity continuity and causal self-model analysis' : undefined;
  const requestTokenBudget = request.requestTokenBudget || request.workerTokenLimit || 8192;
  return { agentId: id, orchestratorAgentId: orchestratorAgentId || null, missionId: missionId || id,
    prompt, currentTask: prompt, role: resolveWorkerRole(request, workerKind),
    workerKind, specialtyNiche,
    identityExperimentScenario: identity.identityExperimentScenario,
    executionMode: 'worker',
    deferAgentTerminalStatus: true,
    workspaceRoot: requestedWorkspace(request), workspaceProvisioned: true,
    readOnlyWorkspaceEvidence: request.readOnlyWorkspaceEvidence === true,
    writeLease: allowFileEdits, localCodeWorker, allowedEvidenceRefs: identity.allowedEvidenceRefs,
    localModel, localContextTokens: request.localContextTokens, localRoutingPolicy: resolveRouting(request, localModel),
    requestTokenBudget, workerTokenLimit: requestTokenBudget,
    identityExperimentArm: identity.identityExperimentArm,
    identityExperimentSeed: identity.identityExperimentSeed,
    timeoutMs: requestTimeoutMs, executionBudget: resolveBudget(missionBudget, requestTimeoutMs),
    executionPolicy: { ...request.executionPolicy, allowedCommands, allowFileEdits, localCodeWorker },
    evidencePolicy: request.evidencePolicy,
    verifierChecks: request.verifierChecks || request.verifier_checks,
    verificationOptions: request.verificationOptions,
    requiredPatchPaths: request.requiredPatchPaths,
    requiredPatchMarkers: request.requiredPatchMarkers,
    requiredPatchMinimumBytes: request.requiredPatchMinimumBytes };
}

async function runWindowsLocalRosterExecution(input, dependencies) {
  const mission = buildLocalMission({ ...input, orchestratorAgentId: input.id });
  const parent = await require('../src/services/missionProtocols/windows').prepare({ db: input.db, mission,
    budget: mission.executionBudget, autonomyPlan: input.autonomyPlan, coordinatorOnly: true }, dependencies);
  await require('../src/services/missionProtocols/windows').execute(parent,
    () => runWindowsLocalRoster(input, dependencies, parent));
  return true;
}

async function runWindowsLocalRoster(input, dependencies, parent) {
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
    plan: autonomyPlan, mission: { ...request, missionId, prompt: enhancedPrompt, workspaceRoot: requestedWorkspace(request),
      executionBudget: parent.normalizedMission.executionBudget, modelBudgetScope: parent.normalizedMission.modelBudgetScope,
      executionPolicy: parent.normalizedMission.executionPolicy }
  });
  if (workers.length !== expected) {
    throw Object.assign(new Error('Windows local worker creation did not match the planned roster.'), {
      code: 'WORKER_CARDINALITY_UNSATISFIABLE', requestedWorkers: assignments.length, createdWorkers: workers.length
    });
  }
  const runResults = await Promise.all(workers.map((worker, index) => runWindowsRosterWorker({
    input: { ...input, parentProtocolContext: parent }, worker, assignment: assignments[index], index, dependencies
  })));
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
  return { started: true, unresolved: false };
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
  const budget = { ...worker.executionBudget, latencyMs: worker.executionBudget?.latencyMs || Math.max(1000, Number(requestTimeoutMs) - 4000) };
  const mission = buildLocalMission({ ...input, id: worker.agentId, missionId, orchestratorAgentId: id,
    enhancedPrompt: worker.prompt || `${input.enhancedPrompt}\n\nAssignment ${index + 1}: ${assignment.hypothesis || assignment.role}`,
    missionBudget: budget, request: { ...input.request, localModel: worker.localModel || input.request.localModel,
      workspaceRoot: worker.workspaceRoot, workerKind: assignment.workerKind, role: assignment.role,
      identityExperimentScenario: undefined }, allowedCommands, allowFileEdits });
  mission.workerKind = assignment.workerKind;
  mission.role = assignment.role;
  mission.toolLease = worker.toolLease || [];
  const ctx = await require('../src/services/missionProtocols/windows').prepare({ db, mission,
    budget: mission.executionBudget, parentScope: input.parentProtocolContext.normalizedMission.modelBudgetScope }, dependencies);
  const startedAt = Date.now();
  const result = await require('../src/services/missionProtocols/windows').execute(ctx,
    () => dependencies.runLocalWorker(db, ctx.normalizedMission, ctx.executionRun),
    localResult => runWindowsRosterPostflight({ input, workers: [worker], dependencies,
      runResults: [{ ...localResult, elapsedMs: Date.now() - startedAt }] }));
  return { ...result, elapsedMs: Date.now() - startedAt };
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
  process.stderr.write('[genos-orchestrate] Windows detected: using in-process local-model execution to avoid worker pipe EPIPE.\n');
  const services = resolveWindowsDependencies(dependencies);
  if (hasMultipleWorkers(input)) { await runWindowsLocalRosterExecution(input, services); return true; }
  return runSingleWindowsExecution(input, services);
}

function resolveWindowsDependencies(dependencies) {
  return { runLocalWorker: dependencies.runLocalWorker || require('../src/services/workerEvidenceBarrierLocal').runLocalWorker,
    validScope: dependencies.validScope || require('../src/services/missionModelBudgetScope').validScope,
    createAutonomousWorkers: dependencies.createAutonomousWorkers, runPostflight: dependencies.runPostflight,
    testHarness: dependencies.testHarness };
}

function hasMultipleWorkers(input) {
  return (input.autonomyPlan?.dispatchWorkers || []).length > 1;
}

async function runSingleWindowsExecution(input, services) {
  const { db, id, missionId, task, enhancedPrompt, request, missionBudget,
    requestTimeoutMs, allowedCommands, allowFileEdits, morphology,
    nceEnhancements, evaluateMissionContinuity, gatherTelemetryAndCoverage,
    finalizeOrchestratedMission, preflight } = input;
  const { runLocalWorker } = services;

  const orchestratorAgentId = id;
  const localMission = buildLocalMission({ ...input, orchestratorAgentId });
  const ctx = await require('../src/services/missionProtocols/windows').prepare({ db, mission: localMission,
    budget: localMission.executionBudget, autonomyPlan: input.autonomyPlan }, services);
  const executionRunId = ctx.executionRun.id;
  const workerStartedAt = Date.now();
  let postflight = { observedTools: [], receipts: [] };
  const localResult = await require('../src/services/missionProtocols/windows').execute(ctx,
    () => runLocalWorker(db, ctx.normalizedMission, ctx.executionRun), async localResult => {
      try {
        const runPostflight = services.runPostflight || require('./orchestratorMcpPreflight.cjs').runOrchestratorMcpPostflight;
        postflight = await runPostflight({ db, orchestratorId: id, missionId, task,
          repoRoot: path.resolve(__dirname, '../..'), workspaceRoot: requestedWorkspace(request), preflight, localResult,
          workerElapsedMs: Date.now() - workerStartedAt });
      } catch (error) {
        require('../src/services/telemetryObserver').emitEvent(require('./orchestratorWindowsLocalExecutionValues1.cjs').runWindowsLocalExecutionValue1({ error, executionRunId, id, missionId, get postflight() { return postflight; } }));
      }
    });
  const agents = localAgents(id, localResult);
  const outcome = require('../src/services/orchestratorOutcome').summarizeAgents(agents);
  const evaluation = await evaluateMissionContinuity({ db, id, task, outcome, agents });
  const audit = await gatherTelemetryAndCoverage(db, id);
  await finalizeOrchestratedMission({ db, outcome, evaluation, morphology, morphologySnapshot: null, nceEnhancements, audit,
    deferredAgentTerminalStatus: true });
  return true;
}

module.exports = { runWindowsLocalExecution, buildLocalMission, runWindowsLocalRosterExecution };
