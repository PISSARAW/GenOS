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
    const deadline = Date.now() + timeoutMs;
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

/**
 * Exécute un agent sur un environnement via le runtime.
 * Attend réellement la fin de l'agent avant de vérifier.
 */
async function executeAgentOnEnvironment(agent, environment, options) {
  options = options || {};
  const timeoutMs = options.timeoutMs || 60000;

  const results = {
    agentId: agent.id,
    environmentId: environment.id,
    steps: [],
    success: false,
    score: 0,
    startedAt: new Date().toISOString(),
    endedAt: null,
  };

  try {
    // 1. Lance l'agent sur l'environnement via le runtime
    const missionPromise = runtime.startMission({
      agentId: agent.id,
      name: `POET Agent ${agent.id}`,
      role: agent.role || 'solver',
      prompt: buildAgentPrompt(agent, environment),
      modelTier: options.modelTier || 'standard',
      executionBudget: { latencyMs: timeoutMs },
      executionPolicy: environment.executionPolicy || {},
    });

    // 2. Attend réellement la fin de l'agent (événement terminal)
    const termination = await waitForMissionTermination(agent.id, timeoutMs);

    if (!termination.terminated) {
      results.error = `Mission did not terminate within ${timeoutMs}ms (last event: ${termination.eventType})`;
      results.endedAt = new Date().toISOString();
      return results;
    }

    // 3. Vérifie la solution dans le sandbox
    const verificationResult = await verifySolutionInSnapshot(results, environment);

    results.success = verificationResult.valid;
    results.score = verificationResult.score;
    results.verification = verificationResult;
  } catch (err) {
    results.error = err.message;
    results.success = false;
  }

  results.endedAt = new Date().toISOString();
  return results;
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
