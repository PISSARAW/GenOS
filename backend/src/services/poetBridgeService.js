'use strict';

/**
 * @file poetBridgeService.js
 * @description Pont entre poetExecutionEngine et environmentGeneratorService.
 * Intègre l'exécution réelle POET dans la boucle de coévolution.
 */

const { executeAgentOnEnvironment } = require('./poetExecutionEngine');

/**
 * Co-évolution avec exécution réelle.
 * Chaque agent est réellement exécuté sur chaque environnement.
 */
async function coevolveWithExecution(agents, environments, options) {
  options = options || {};
  const results = [];

  for (const env of environments) {
    const evaluations = [];

    for (const agent of agents) {
      try {
        // Exécution réelle de l'agent sur l'environnement
        const execResult = await executeAgentOnEnvironment(agent, env, options);
        evaluations.push({
          agent,
          evaluation: {
            capabilityScore: execResult.score,
            difficultyFactor: 1 - env.difficulty * 0.5,
            overallScore: execResult.score,
            canSolve: execResult.success,
          },
          executionResult: execResult,
        });
      } catch (err) {
        evaluations.push({
          agent,
          evaluation: { capabilityScore: 0, difficultyFactor: 0, overallScore: 0, canSolve: false },
          error: err.message,
        });
      }
    }

    evaluations.sort((a, b) => b.evaluation.overallScore - a.evaluation.overallScore);
    const best = evaluations[0];

    if (best) {
      env.stats.attemptCount += 1;
      if (best.evaluation.canSolve) {
        env.stats.solvedCount += 1;
        env.stats.bestAgentId = best.agent.id;
        env.stats.bestScore = best.evaluation.overallScore;
      }
    }

    results.push({ environment: env, bestAgent: best?.agent || null, evaluations });
  }

  return results;
}

/**
 * Fallback : évaluation sans exécution (si poetExecutionEngine non dispo).
 */
function coevolveSimulated(agents, environments) {
  const { evaluateAgentOnEnvironment } = require('./environmentGeneratorService');
  const results = [];

  for (const env of environments) {
    const evaluations = agents.map((agent) => ({
      agent,
      evaluation: evaluateAgentOnEnvironment(agent, env),
    }));
    evaluations.sort((a, b) => b.evaluation.overallScore - a.evaluation.overallScore);
    const best = evaluations[0];
    if (best) {
      env.stats.attemptCount += 1;
      if (best.evaluation.canSolve) {
        env.stats.solvedCount += 1;
        env.stats.bestAgentId = best.agent.id;
        env.stats.bestScore = best.evaluation.overallScore;
      }
    }
    results.push({ environment: env, bestAgent: best?.agent || null, evaluations });
  }

  return results;
}

module.exports = {
  coevolveWithExecution,
  coevolveSimulated,
};
