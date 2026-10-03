'use strict';

const POLICIES = Object.freeze({
  scout_cell: { maxIterations: 1 },
  resident_daemon: { maxIterations: null, maxTimeMs: null },
  bounded_worker: { maxIterations: 10 },
  adaptive_worker: { maxIterations: 20, maxStrategyChanges: 3, maxCognitiveChanges: 2 }
  specialist: { maxIterations: 20, maxStrategyChanges: 3, maxCognitiveChanges: 2 }
  procedural_executor: { maxIterations: 10, maxTokens: 0 }
  symbiotic_worker: { maxIterations: 10 }
});
function workerPolicy(kind) {
  return POLICIES[kind] || {};
}

module.exports = { POLICIES, workerPolicy };
