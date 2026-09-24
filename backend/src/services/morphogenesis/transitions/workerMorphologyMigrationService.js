'use strict';

const MIGRATION_DIMENSIONS = Object.freeze([
  'phenotypeFit', 'capabilityFit', 'memoryRelevance',
  'stateCompatibility', 'relationshipContinuity', 'migrationCost'
]);

function scoreValue(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}

function normalizedScores(input) {
  return Object.fromEntries(MIGRATION_DIMENSIONS.map((dimension) => [dimension, scoreValue(input[dimension])]));
}

function migrationUtility(scores) {
  return (scores.phenotypeFit * 0.2) + (scores.capabilityFit * 0.25)
    + (scores.memoryRelevance * 0.1) + (scores.stateCompatibility * 0.2)
    + (scores.relationshipContinuity * 0.15) - (scores.migrationCost * 0.1);
}

function chooseAction(scores, utility) {
  if (scores.stateCompatibility < 0.5) return 'migrate';
  if (utility >= 0.8 && scores.phenotypeFit >= 0.8) return 'reuse';
  if (utility >= 0.6) return 'rebind';
  if (scores.capabilityFit >= 0.5) return 'reconfigure';
  return 'migrate';
}

function evaluateWorkerMigration(input = {}) {
  const scores = normalizedScores(input.scores || {});
  const utility = migrationUtility(scores);
  return {
    workerId: input.workerId || null,
    targetNodeId: input.targetNodeId || null,
    scores,
    utility,
    action: chooseAction(scores, utility),
    spawnReplacement: false,
    rationale: 'reuse, rebind or reconfigure is preferred when the measured fit remains adequate'
  };
}

module.exports = { MIGRATION_DIMENSIONS, evaluateWorkerMigration };
