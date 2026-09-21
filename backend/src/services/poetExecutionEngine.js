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

/**
 * Exécute un agent sur un environnement via le runtime.
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
    // 1. Exécute l'agent sur l'environnement via le runtime
    const missionResult = await runtime.startMission({
      agentId: agent.id,
      name: `POET Agent ${agent.id}`,
      role: agent.role || 'solver',
      prompt: buildAgentPrompt(agent, environment),
      modelTier: options.modelTier || 'standard',
      executionBudget: { latencyMs: timeoutMs },
      executionPolicy: environment.executionPolicy || {},
    });

    // 2. Vérifie la solution dans le sandbox
    const verificationResult = await verifySolutionInSnapshot(missionResult, environment);

    results.success = verificationResult.valid;
    results.score = verificationResult.score;
    results.verification = verificationResult;
    results.missionResult = missionResult;
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
  const snapshotPath = snapshot?.snapshotPath || snapshot?.metadata?.snapshotPath;
  const result = await runInSnapshot({
    snapshot: { path: snapshotPath },
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
