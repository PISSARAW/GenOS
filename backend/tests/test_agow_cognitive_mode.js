'use strict';

const assert = require('node:assert/strict');
const policy = require('../src/services/agow/cognitiveModePolicyService');

function highUncertaintyPrefersSimulation() {
  const result = policy.evaluate({ signals: { uncertainty: 0.95, irreversibility: 0.9,
    selfTwinUncertainty: 0.95, viabilityRisk: 0.1, goalUrgency: 0.1, evidenceGap: 0.8 },
  modeCosts: { SIMULATE: 0.05 } });
  assert.equal(result.mode, 'SIMULATE');
  assert.equal(result.provenance.calibrated, false);
}

function outcomeUpdatesModeRegret() {
  const decision = policy.evaluate({ signals: { goalUrgency: 0.9, uncertainty: 0.1 } });
  const outcome = policy.observeOutcome({ decision, realizedLoss: 0.1 });
  assert.equal(outcome.mode, decision.mode);
  assert.equal(outcome.predictionError, 0.1 - decision.expectedLoss);
  assert.throws(() => policy.observeOutcome({ decision, realizedLoss: 0.1, mode: 'INVALID' }), /invalid/);
}

highUncertaintyPrefersSimulation();
outcomeUpdatesModeRegret();
console.log('AGOW cognitive mode checks passed.');
