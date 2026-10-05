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
        capabilityScore: executionResult.success ? executionResult.score : 0,
        difficultyFactor: 1 - environment.difficulty * 0.5,
        overallScore: executionResult.success ? executionResult.score : 0,
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
  environment.stats ||= { attemptCount: 0, solvedCount: 0 };
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
  const fingerprints = await validateContentSplit(training, heldOut);
  const trainingResults = await coevolveWithExecution(agents, cloneEnvironments(training), options);
  const selectedAgent = selectTrainingAgent(agents, trainingResults);
  const heldOutResults = await coevolveWithExecution([selectedAgent], cloneEnvironments(heldOut), options);
  const trainingMetrics = summarizeResults(trainingResults.map((entry) => ({ ...entry, bestAgent: selectedAgent })));
  const heldOutMetrics = summarizeResults(heldOutResults);
  const measured = hasMeasuredExecutions([...trainingResults, ...heldOutResults], selectedAgent.id);
  return {
    selectedAgentId: selectedAgent.id,
    fingerprints,
    measured,
    training: trainingMetrics,
    heldOut: heldOutMetrics,
    generalizationGap: measured ? trainingMetrics.successRate - heldOutMetrics.successRate : null,
    split: { trainingIds: training.map((env) => env.id), heldOutIds: heldOut.map((env) => env.id) },
    executionEvidence: executionEvidence([...trainingResults, ...heldOutResults]),
    evidenceRef: hashResults([...trainingResults, ...heldOutResults]),
  };
}

async function validateContentSplit(training, heldOut) {
  const { environmentFingerprint } = require('./poetExecutionEvidence');
  const all = await Promise.all([...training, ...heldOut].map(environmentFingerprint));
  if (new Set(all).size !== all.length) throw new Error('Generalization content must be disjoint');
  return { training: all.slice(0, training.length), heldOut: all.slice(training.length) };
}

function selectTrainingAgent(agents, results) {
  const scores = agents.map((agent) => ({ agent, score: results.reduce((sum, result) =>
    sum + (result.evaluations.find((item) => item.agent.id === agent.id)?.evaluation.overallScore || 0), 0) }));
  scores.sort((left, right) => right.score - left.score || left.agent.id.localeCompare(right.agent.id));
  return scores[0].agent;
}

function validateGeneralizationInput(agents, training, heldOut) {
  if (!Array.isArray(agents) || agents.length === 0) throw new Error('Generalization requires at least one agent');
  if (!training.length || !heldOut.length) throw new Error('Generalization requires non-empty training and held-out sets');
  validateSplitIds(training, heldOut);
  [...training, ...heldOut].forEach(validateEnvironment);
}

function validateSplitIds(training, heldOut) {
  const allIds = [...training, ...heldOut].map((env) => env.id);
  if (new Set(allIds).size !== allIds.length) throw new Error('Generalization IDs must be unique');
  const ids = new Set(training.map((env) => env.id));
  const invalidTraining = [...ids].some((id) => id == null);
  const overlaps = heldOut.some((env) => env.id == null || ids.has(env.id));
  if (invalidTraining || overlaps) throw new Error('Generalization environment IDs must be present and disjoint');
}

function validateEnvironment(environment) {
  require('./poetExecutionEvidence').validateVerifierContract(environment);
  if (!environment.stats || !Number.isFinite(environment.difficulty)) {
    throw new Error(`Invalid POET environment ${environment.id}`);
  }
}

function hasMeasuredExecutions(results, agentId) {
  return results.every((entry) => {
    const execution = entry.evaluations.find((item) => item.agent.id === agentId)?.executionResult;
    return execution?.termination?.eventType === 'AGENT_COMPLETED'
      && Number.isInteger(execution.verification?.exitCode) && !execution.error;
  });
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

function executionEvidence(results) {
  return results.flatMap((entry) => entry.evaluations.map((item) => ({
    environmentId: entry.environment.id, agentId: item.agent.id,
    runtimeAgentId: item.executionResult?.runtimeAgentId || null,
    error: item.executionResult?.error || item.error || null,
    terminalEvent: item.executionResult?.termination?.eventType || null,
    baselineSnapshotHash: item.executionResult?.baselineSnapshotHash || null,
    success: item.executionResult?.success === true,
    score: item.evaluation.overallScore,
    artifact: item.executionResult?.artifact || null,
    verification: item.executionResult?.verification || null,
  })));
}

function hashResults(results) {
  return createHash('sha256').update(JSON.stringify(executionEvidence(results))).digest('hex');
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
