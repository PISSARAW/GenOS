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

testHealthyRedundantCommunity();
testAccumulatingPressure();
testRejectsUnmeasuredSignal();
console.log('✅ Holobiont dysbiosis tests passed.');
