'use strict';

/**
 * @file poetBridgeService.js
 * @description Pont entre poetExecutionEngine et environmentGeneratorService.
 * Intègre l'exécution réelle POET dans la boucle de coévolution.
 */

const { createHash } = require('node:crypto');
const { executeAgentOnEnvironment } = require('./poetExecutionEngine');

/** Exécute réellement chaque agent sur chaque environnement POET. */
async function coevolveWithExecution(agents, environments, options) {
  const results = [];
  for (const env of environments) {
    const evaluations = await executeEnvironment(agents, env, options || {});
    evaluations.sort((a, b) => b.evaluation.overallScore - a.evaluation.overallScore);
    const best = evaluations[0];
    updateEnvironmentStats(env, best);
    results.push({ environment: env, bestAgent: best?.agent || null, evaluations });
  }
  return results;
}

async function executeEnvironment(agents, environment, options) {
  const evaluations = [];
  for (const agent of agents) {
    try {
      const executionResult = await executeAgentOnEnvironment(agent, environment, options);
      evaluations.push({ agent, evaluation: {
        capabilityScore: executionResult.score,
        difficultyFactor: 1 - environment.difficulty * 0.5,
        overallScore: executionResult.score,
        canSolve: executionResult.success,
      }, executionResult });
    } catch (error) {
      evaluations.push({ agent, evaluation: {
        capabilityScore: 0, difficultyFactor: 0, overallScore: 0, canSolve: false,
      }, error: error.message });
    }
  }
  return evaluations;
}

function updateEnvironmentStats(environment, best) {
  if (!best) return;
  environment.stats.attemptCount += 1;
  if (!best.evaluation.canSolve) return;
  environment.stats.solvedCount += 1;
  environment.stats.bestAgentId = best.agent.id;
  environment.stats.bestScore = best.evaluation.overallScore;
}

/**
 * Mesure la généralisation par exécution réelle sur un split disjoint.
 * Les identifiants/hashes du split sont retournés pour rendre l'évaluation auditable.
 */
async function evaluateGeneralization(agents, split, options) {
  const training = split?.training || [];
  const heldOut = split?.heldOut || [];
  validateGeneralizationInput(agents, training, heldOut);
  const trainingResults = await coevolveWithExecution(agents, cloneEnvironments(training), options);
  const heldOutResults = await coevolveWithExecution(agents, cloneEnvironments(heldOut), options);
  const trainingMetrics = summarizeResults(trainingResults);
  const heldOutMetrics = summarizeResults(heldOutResults);
  return {
    measured: hasMeasuredExecutions([...trainingResults, ...heldOutResults]),
    training: trainingMetrics,
    heldOut: heldOutMetrics,
    generalizationGap: trainingMetrics.successRate - heldOutMetrics.successRate,
    split: { trainingIds: training.map((env) => env.id), heldOutIds: heldOut.map((env) => env.id) },
    evidenceRef: hashResults([...trainingResults, ...heldOutResults]),
  };
}

function validateGeneralizationInput(agents, training, heldOut) {
  if (!Array.isArray(agents) || agents.length === 0) throw new Error('Generalization requires at least one agent');
  if (!training.length || !heldOut.length) throw new Error('Generalization requires non-empty training and held-out sets');
  validateSplitIds(training, heldOut);
  [...training, ...heldOut].forEach(validateEnvironment);
}

function validateSplitIds(training, heldOut) {
  const ids = new Set(training.map((env) => env.id));
  const invalidTraining = [...ids].some((id) => id == null);
  const overlaps = heldOut.some((env) => env.id == null || ids.has(env.id));
  if (invalidTraining || overlaps) throw new Error('Generalization environment IDs must be present and disjoint');
}

function validateEnvironment(environment) {
  if (!environment.stats || !Number.isFinite(environment.difficulty)) {
    throw new Error(`Invalid POET environment ${environment.id}`);
  }
}

function hasMeasuredExecutions(results) {
  return results.every((entry) => entry.bestAgent &&
    entry.evaluations.some((item) => item.executionResult?.endedAt));
}

function cloneEnvironments(environments) {
  return environments.map((env) => ({ ...env, stats: {
    ...env.stats, attemptCount: 0, solvedCount: 0, bestAgentId: null, bestScore: 0,
  } }));
}

function summarizeResults(results) {
  const solved = results.filter(environmentSolved).length;
  const scoreSum = results.reduce((sum, result) => sum + selectedScore(result), 0);
  return { count: results.length, solved, successRate: solved / results.length, meanScore: scoreSum / results.length };
}

function environmentSolved(result) {
  if (!result.bestAgent) return false;
  return result.evaluations.some((evaluation) => evaluation.agent.id === result.bestAgent.id && evaluation.evaluation.canSolve);
}

function selectedScore(result) {
  if (!result.bestAgent) return 0;
  return result.evaluations.find((evaluation) => evaluation.agent.id === result.bestAgent.id)?.evaluation.overallScore || 0;
}

function hashResults(results) {
  return createHash('sha256').update(JSON.stringify(results.map((result) => ({
    environmentId: result.environment.id,
    executions: result.evaluations.map((item) => ({
      agentId: item.agent.id, success: item.executionResult?.success === true,
      score: item.executionResult?.score || 0, endedAt: item.executionResult?.endedAt || null,
      error: item.executionResult?.error || item.error || null,
    })),
  })))).digest('hex');
}

/** Simulation retained for explicit fixtures; never used by evaluateGeneralization. */
function coevolveSimulated(agents, environments) {
  const { evaluateAgentOnEnvironment } = require('./environmentGeneratorService');
  return environments.map((env) => {
    const evaluations = agents.map((agent) => ({ agent, evaluation: evaluateAgentOnEnvironment(agent, env) }));
    evaluations.sort((a, b) => b.evaluation.overallScore - a.evaluation.overallScore);
    const best = evaluations[0];
    updateEnvironmentStats(env, best);
    return { environment: env, bestAgent: best?.agent || null, evaluations };
  });
}

module.exports = { coevolveWithExecution, coevolveSimulated, evaluateGeneralization };
