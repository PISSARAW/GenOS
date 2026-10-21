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
  return request.modelId || request.model_id || process.env.GENOS_LOCAL_MODEL
    || process.env.OLLAMA_MODEL || 'qwen2.5-coder:7b';
}

function buildLocalMission(input) {
  const { id, missionId, enhancedPrompt, request, missionBudget,
    requestTimeoutMs, allowedCommands, allowFileEdits } = input;
  const localCodeWorker = requestedCodeWorker(request);
  return { agentId: id, orchestratorAgentId: id, missionId: missionId || id,
    prompt: enhancedPrompt, currentTask: enhancedPrompt, role: 'implementation',
    workerKind: 'bounded_worker', executionMode: 'orchestrator',
    workspaceRoot: requestedWorkspace(request), workspaceProvisioned: true,
    writeLease: allowFileEdits, localCodeWorker, allowedEvidenceRefs: ['mission'],
    localModel: requestedModel(request), timeoutMs: requestTimeoutMs,
    executionBudget: { ...missionBudget, tokens: missionBudget.tokens || 8192,
      latencyMs: missionBudget.latencyMs || Math.max(1000, Number(requestTimeoutMs) - 4000) },
    executionPolicy: { allowedCommands, allowFileEdits, localCodeWorker } };
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
  const executionRun = { id: 'local-direct-' + id };
  const localMission = buildLocalMission(input);
  const localResult = await runLocalWorker(db, localMission, executionRun);
  const agents = localAgents(id, localResult);
  const outcome = require('../src/services/orchestratorOutcome').summarizeAgents(agents);
  const evaluation = await evaluateMissionContinuity({ db, id, task, outcome, agents });
  const audit = await gatherTelemetryAndCoverage(db, id);
  await finalizeOrchestratedMission({ db, outcome, evaluation, morphology, morphologySnapshot: null, nceEnhancements, audit });
  return true;
}

module.exports = { runWindowsLocalExecution };
