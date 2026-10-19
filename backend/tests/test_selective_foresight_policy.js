'use strict';

const assert = require('node:assert/strict');
const policy = require('../src/services/predictiveTimescale/selectiveForesightPolicy');

function candidate(overrides = {}) {
  return { candidateId: 'forecast:deploy', calibratedConfidence: 0.8,
    expectedInformationGain: 0.7, predictedDecisionImpact: 0.6,
    costTokens: 1200, estimatedMs: 4000, ...overrides };
}

function input(overrides = {}) {
  return { permissions: [policy.PERMISSION], budget: { remainingTokens: 2000, remainingMs: 5000 },
    candidates: [candidate()], projectId: 'project:genos', trajectoryId: 'trajectory:release-7',
    responsibleAgentId: 'agent:release', ...overrides };
}

function verifiesFailClosedPermission() {
  const result = policy.decide(input({ permissions: [] }));
  assert.equal(result.decision, 'NO_CHANGE');
  assert.equal(result.reason, 'permission_missing');
}

function verifiesBudgetAndConfidenceAbstention() {
  const expensive = policy.decide(input({ budget: { remainingTokens: 10, remainingMs: 10 } }));
  assert.equal(expensive.reason, 'budget_insufficient');
  const uncertain = policy.decide(input({ candidates: [candidate({ calibratedConfidence: 0.2 })] }));
  assert.equal(uncertain.reason, 'insufficient_expected_value');
  assert.equal(policy.meetsThresholds(candidate({ predictedDecisionImpact: 0 }), {
    minConfidence: 0.55, minInformationGain: 0.15, minDecisionImpact: 0.1 }), false);
}

function verifiesSelectiveForesight() {
  const result = policy.decide(input({ candidates: [candidate(), candidate({ candidateId: 'forecast:cheap',
    costTokens: 200, estimatedMs: 500, expectedInformationGain: 0.65 })] }));
  assert.equal(result.decision, 'RUN_FORESIGHT');
  assert.equal(result.selectedCandidateId, 'forecast:cheap');
  assert.equal(result.trajectoryId, 'trajectory:release-7');
  assert.equal(result.mayCountAsRealEffect, false);
  assert.equal(result.evidenceClass, 'counterfactual');
}

verifiesFailClosedPermission();
verifiesBudgetAndConfidenceAbstention();
verifiesSelectiveForesight();
console.log('Selective foresight permission and NO_CHANGE checks passed.');
