'use strict';

const assert = require('assert');
const { detectDysbiosis } = require('../src/services/holobionte/health/dysbiosisDetector');

function testHealthyRedundantCommunity() {
  const result = detectDysbiosis({
    resourceConcentration: 0.1, dependencyConcentration: 0.1, harmfulActivity: 0,
    conflictRate: 0.1, immunePressure: 0.1, functionalRedundancy: 0.9
  });
  assert.strictEqual(result.state, 'STABLE');
  assert.strictEqual(result.score, 0);
  assert.strictEqual(result.automaticActionApplied, false);
  assert.strictEqual(result.status, 'heuristic');
  assert.strictEqual(result.signals.resourceConcentration.status, 'heuristic');
  assert.strictEqual(result.signals.resourceConcentration.value, 0.1);
}

function testMeasuredSignalStatus() {
  const result = detectDysbiosis({
    resourceConcentration: { value: 0.9, status: 'measured' },
    dependencyConcentration: 0.8, harmfulActivity: 0.8,
    conflictRate: 0.7, immunePressure: 0.8, functionalRedundancy: 0.1
  });
  assert.strictEqual(result.signals.resourceConcentration.status, 'measured');
  assert.strictEqual(result.signalStatuses.resourceConcentration, 'measured');
  assert.strictEqual(result.measurementStatus, 'heuristic');
  assert.strictEqual(result.detectionStatus, 'heuristic');
  assert.strictEqual(result.promotionEligible, false);
}

function testAccumulatingPressure() {
  const result = detectDysbiosis({
    resourceConcentration: 0.9, dependencyConcentration: 0.8, harmfulActivity: 0.8,
    conflictRate: 0.7, immunePressure: 0.8, functionalRedundancy: 0.1
  });
  assert.strictEqual(result.state, 'ALERT');
  assert.ok(result.reasons.includes('resourceConcentration'));
  assert.ok(result.reasons.includes('functionalRedundancy'));
}

function testRejectsUnmeasuredSignal() {
  assert.throws(() => detectDysbiosis({ resourceConcentration: 2 }), { code: 'HOLOBIONT_DYSBIOSIS_INVALID' });
}

function testConfigurableThresholds() {
  const signals = {
    resourceConcentration: 0.4, dependencyConcentration: 0.4, harmfulActivity: 0.4,
    conflictRate: 0.4, immunePressure: 0.4, functionalRedundancy: 0.5
  };
  assert.strictEqual(detectDysbiosis(signals).state, 'STABLE');
  const configured = detectDysbiosis(signals, { watchScore: 0.2, alertScore: 0.4 });
  assert.strictEqual(configured.state, 'WATCH');
  assert.strictEqual(configured.thresholds.watchScore, 0.2);
  assert.strictEqual(configured.thresholds.signalExtreme, 0.7);
}

function testMeasuredInputsRemainHeuristicAssessment() {
  const measured = Object.fromEntries([
    ['resourceConcentration', 0.9], ['dependencyConcentration', 0.8],
    ['harmfulActivity', 0.8], ['conflictRate', 0.7],
    ['immunePressure', 0.8], ['functionalRedundancy', 0.1]
  ].map(([name, value]) => [name, { value, status: 'measured' }]));
  const result = detectDysbiosis(measured);
  assert.strictEqual(result.measurementStatus, 'measured');
  assert.strictEqual(result.status, 'heuristic');
  assert.strictEqual(result.promotionEligible, false);
}

function testRejectsInvalidConfiguration() {
  const signals = {
    resourceConcentration: 0, dependencyConcentration: 0, harmfulActivity: 0,
    conflictRate: 0, immunePressure: 0, functionalRedundancy: 1
  };
  assert.throws(() => detectDysbiosis(signals, { watchScore: 0.8, alertScore: 0.6 }), {
    code: 'HOLOBIONT_DYSBIOSIS_INVALID'
  });
  assert.throws(() => detectDysbiosis({
    ...signals, conflictRate: { value: 0, status: 'estimated' }
  }), { code: 'HOLOBIONT_DYSBIOSIS_INVALID' });
}

testHealthyRedundantCommunity();
testMeasuredSignalStatus();
testAccumulatingPressure();
testRejectsUnmeasuredSignal();
testConfigurableThresholds();
testMeasuredInputsRemainHeuristicAssessment();
testRejectsInvalidConfiguration();
console.log('✅ Holobiont dysbiosis tests passed.');
