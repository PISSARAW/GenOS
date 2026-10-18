'use strict';

const assert = require('assert');
const consciousnessService = require('../src/services/consciousnessService');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  ✗ ${name}: ${error.message}`);
  }
}

test('recordQualia stores an agent-supplied label without a metaphysical claim', () => {
  const report = consciousnessService.recordQualia({
    agentId: 'agent-1', experience: 'processing evidence', intensity: 0.8, valence: 0.5
  });
  assert.strictEqual(report.agentId, 'agent-1');
  assert.strictEqual(report.intensity, 0.8);
  assert.strictEqual(report.phenomenalAccess, 'unassessed');
  assert.strictEqual(report.metaphysicalClaimEstablished, false);
});

test('recordIntentionality captures aboutness without subjective awareness', () => {
  const report = consciousnessService.recordIntentionality({
    agentId: 'agent-1', target: 'mission-42', mode: 'aboutness'
  });
  assert.strictEqual(report.target, 'mission-42');
  assert.strictEqual(report.subjectiveAwareness, 'unassessed');
  assert.strictEqual(report.metaphysicalClaimEstablished, false);
});

test('checkSupervenience keeps a single observation inconclusive', () => {
  const report = consciousnessService.checkSupervenience({
    mentalState: { strategy: 'tree-search' }, physicalState: { cpu: 'x86' }
  });
  assert.strictEqual(report.status, 'insufficient_comparison');
  assert.strictEqual(report.metaphysicalClaimEstablished, false);
});

test('mindBodyInteraction records a descriptive coupling only', () => {
  const report = consciousnessService.mindBodyInteraction({
    agentId: 'agent-1', body: 'workspace-alpha', interaction: 'causal'
  });
  assert.strictEqual(report.interaction, 'causal');
  assert.strictEqual(report.metaphysicalClaimEstablished, false);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exitCode = 1;
