'use strict';

/**
 * @file poetExecutionEngine.js
 * @description Exécution réelle des environnements POET.
 *
 * Corrigé : utilise le runtime agent pour l'exécution,
 * puis le sandbox uniquement pour vérification.
 *
 * Boucle :
 *   Agent runtime
 *       ↓
 *   solution/artifact
 *       ↓
 *   snapshot
 *       ↓
 *   allowed verifier command
 *       ↓
 *   score
 */

const runtime = require('./agentRuntimeAdapter');
const telemetry = require('./telemetryObserver');

const TERMINAL_EVENTS = new Set([
  'AGENT_COMPLETED', 'AGENT_FAILED', 'AGENT_RUNTIME_ERROR',
  'AGENT_HALTED', 'WORKER_TASK_FAILED', 'WORKER_NO_ANSWER_PROVEN',
  'MISSION_NO_ANSWER_PROVEN',
]);

/**
 * Attend la fin réelle de la mission de l'agent via le flux telemetry.
 * Résout quand un événement terminal est émis pour cet agent.
 */
function waitForMissionTermination(agentId, timeoutMs) {
  return new Promise((resolve) => {
    let timer = null;
    const handler = (event) => {
      if (event.agentId !== agentId) return;
      if (!TERMINAL_EVENTS.has(event.eventType)) return;
      clearTimeout(timer);
      telemetry.removeListener('telemetry', handler);
      resolve({ terminated: true, eventType: event.eventType, event });
    };
    telemetry.on('telemetry', handler);
    timer = setTimeout(() => {
      telemetry.removeListener('telemetry', handler);
      resolve({ terminated: false, eventType: 'TIMEOUT' });
    }, timeoutMs);
  });
}

function baseResults(agent, environment) {
  return {
    agentId: agent.id,
    environmentId: environment.id,
    steps: [],
    success: false,
    score: 0,
    startedAt: new Date().toISOString(),
    endedAt: null,
  };
}

function launchAgentMission(agent, environment, opts) {
  return runtime.startMission({
    agentId: agent.id,
    name: `POET Agent ${agent.id}`,
    role: agent.role || 'solver',
    prompt: buildAgentPrompt(agent, environment),
    modelTier: opts.modelTier || 'standard',
    executionBudget: { latencyMs: opts.timeoutMs },
    executionPolicy: environment.executionPolicy || {},
  });
}

function attachOutcome(results, missionOutcome) {
  if (!missionOutcome || typeof missionOutcome !== 'object') return;
  results.missionOutcome = missionOutcome;
  if (missionOutcome.artifact) results.artifact = missionOutcome.artifact;
  if (missionOutcome.solution) results.solution = missionOutcome.solution;
}

async function verifyAndScore(results, environment) {
  const verificationResult = await verifySolutionInSnapshot(results, environment);
  results.success = verificationResult.valid;
  results.score = verificationResult.score;
  results.verification = verificationResult;
}

/**
 * Exécute un agent sur un environnement via le runtime.
 * Attend réellement la fin de l'agent avant de vérifier.
 */
async function executeAgentOnEnvironment(agent, environment, options) {
  const opts = normalizePoetOptions(options);
  const results = baseResults(agent, environment);
  try {
    await runAgentToTermination({ agent, environment, opts, results });
  } catch (err) {
    results.error = err.message;
    results.success = false;
  }
  results.endedAt = new Date().toISOString();
  return results;
}

function normalizePoetOptions(options) {
  const opts = options || {};
  return { timeoutMs: opts.timeoutMs || 60000, modelTier: opts.modelTier || 'standard' };
}

async function runAgentToTermination(ctx) {
  const { agent, environment, opts, results } = ctx;
  const missionPromise = launchAgentMission(agent, environment, opts);
  const termination = await waitForMissionTermination(agent.id, opts.timeoutMs);
  if (!termination.terminated) {
    results.error = timeoutMessage(opts.timeoutMs, termination.eventType);
    return;
  }
  attachOutcome(results, await missionPromise.catch(toErrorObject));
  await verifyAndScore(results, environment);
}

function timeoutMessage(timeoutMs, eventType) {
  return `Mission did not terminate within ${timeoutMs}ms (last event: ${eventType})`;
}

function toErrorObject(err) {
  return { error: err.message };
}

function buildAgentPrompt(agent, environment) {
  const goal = environment.goals?.[0] || 'Solve the problem';
  const constraints = environment.constraints || {};
  return `${agent.role || 'Agent'}: ${goal}\n\nConstraints: ${JSON.stringify(constraints)}\n\nProvide a solution as structured output.`;
}

async function verifySolutionInSnapshot(missionResult, environment) {
  const { runInSnapshot } = require('./workspaceSnapshotRun');
  const { capture } = require('./workspaceSnapshotStore');

  // Prépare le snapshot
  const snapshot = await capture({
    workspace: { path: environment.workspacePath, id: environment.workspaceId },
    label: 'POET verification',
    reason: 'Verify solution',
    author: 'poet_engine',
    agentId: environment.id,
  });

  // Vérifie via commande autorisée
  const snapshotPath = snapshot?.metadata?.storagePath;
  if (!snapshotPath) {
    return {
      valid: false,
      score: 0,
      output: 'POET verification: capture returned no storagePath',
    };
  }
  const result = await runInSnapshot({
    snapshot: { id: snapshot?.id, snapshot_hash: snapshot?.snapshotHash, metadata: snapshot?.metadata },
    command: 'npm test',
    timeoutMs: 30000,
    workspacePath: environment.workspacePath,
  });

  return {
    valid: result.exitCode === 0,
    score: result.exitCode === 0 ? 1 : 0,
    output: result.stdout,
  };
}

module.exports = {
  executeAgentOnEnvironment,
  buildAgentPrompt,
  verifySolutionInSnapshot,
};
