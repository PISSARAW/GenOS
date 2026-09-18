'use strict';

const { boundedAnalysis, withEpistemicContext } = require('./philosophyAnalysisContract');

function inputList(value, name) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`${name} must be an array.`);
  return value;
}

function processName(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('process must be a non-empty string.');
  return value;
}

function runSuccess(run, index) {
  if (!run || typeof run !== 'object' || typeof run.success !== 'boolean') {
    throw new Error(`observations[${index}] must declare a boolean success.`);
  }
  return run.success;
}

function reliabilityStatus(runs, counterexamples, rate) {
  if (counterexamples.length > 0) return 'process-contested';
  if (runs.length < 2) return 'insufficient-observations';
  return rate >= 0.8 ? 'reliability-candidate' : 'low-reliability';
}

function assessReliability({ process, observations, counterexamples = [], independence = null } = {}) {
  const name = processName(process);
  const runs = inputList(observations, 'observations');
  const failures = inputList(counterexamples, 'counterexamples');
  const successes = runs.filter(runSuccess).length;
  const rate = runs.length ? Number((successes / runs.length).toFixed(3)) : null;
  const status = reliabilityStatus(runs, failures, rate || 0);
  const result = boundedAnalysis({
    kind: 'reliability-assessment', process: name, observations: runs,
    successes, failures: runs.length - successes, reliability: rate,
    counterexamples: failures, independence, status,
    limitation: 'La fréquence observée décrit la fiabilité d’un processus fourni ; elle ne garantit ni la vérité de chaque sortie ni la représentativité des observations.',
  });
  return withEpistemicContext(result, {
    methodology: 'reliabilism', reasoningStatus: status,
  });
}

module.exports = { assessReliability };
