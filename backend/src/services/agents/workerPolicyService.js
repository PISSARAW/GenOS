'use strict';

const POLICIES = Object.freeze({
  scout_cell: { maxIterations: 1 },
  resident_daemon: { maxIterations: null, maxTimeMs: 1800000 },
  bounded_worker: { maxIterations: 10 },
  adaptive_worker: { maxIterations: 20, maxStrategyChanges: 3, maxCognitiveChanges: 2 },
  specialist: { maxIterations: 20, maxStrategyChanges: 3, maxCognitiveChanges: 2 },
  procedural_executor: { maxIterations: 10, maxTokens: 0 },
  symbiotic_worker: { maxIterations: 10 },
  verifier_worker: { maxIterations: 5 },
  red_worker: { maxIterations: 5 },
  experimental_worker: { maxIterations: 10 },
  formal_worker: { maxIterations: 10, maxTokens: 0 },
  synthesis_worker: { maxIterations: 10 },
  creative_worker: { maxIterations: 10, maxCognitiveChanges: 2 },
  medical_worker: { maxIterations: 8 },
  recovery_worker: { maxIterations: 3 },
  forensic_worker: { maxIterations: 5 },
  liaison_worker: { maxIterations: 10, maxMessages: 32 },
  teaching_worker: { maxIterations: 10 },
  sub_orchestrator: { maxIterations: 30, maxChildren: 5, maxTokens: 10000 }
});

function workerPolicy(kind) {
  return POLICIES[kind] || {};
}

module.exports = { POLICIES, workerPolicy };
