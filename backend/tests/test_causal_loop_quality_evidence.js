'use strict';

const assert = require('node:assert/strict');
const causalLoop = require('../src/services/morphogenesis/causalLoopService');

const result = causalLoop.processActionReceipt({
  agentId: 'quality-evidence-test',
  actionReceipt: {
    actionId: 'declared-only',
    outcome: { success: true, quality: 0.99, status: 'completed' },
    expectedOutcome: { success: true, quality: 0.5 }
  },
  expressionContext: {
    problemFeatures: { problemType: 'test', complexity: 0.5 },
    morphology: { topology: 'trinity' }
  }
});

assert.equal(result.outcome.quality, null);
assert.equal(result.outcome.qualityVerified, false);
assert.equal(result.outcome.declaredQuality, 0.99);
assert.equal(result.rpe.eligible, false);
assert.equal(result.memoryConsolidated.reason, 'verified_outcome_required');
assert.equal(result.strategyPerformance.recorded, false);
assert.equal(result.recipePerformance.recorded, false);
assert.equal(result.morphologyExperience.recorded, false);
console.log('Causal learning ignores self-declared quality without a signed verifier receipt.');
