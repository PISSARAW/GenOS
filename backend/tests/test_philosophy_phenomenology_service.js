'use strict';

const assert = require('assert');
const phenomenologyService = require('../src/services/phenomenologyService');

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

test('intentionality captures aboutness without a metaphysical claim', () => {
  const report = phenomenologyService.intentionality({
    agentId: 'agent-1', target: 'goal-7', mode: 'aboutness'
  });
  assert.strictEqual(report.target, 'goal-7');
  assert.strictEqual(report.noema.object, 'goal-7');
  assert.strictEqual(report.consciousnessIsAlwaysOfSomething, true);
  assert.strictEqual(report.subjectiveAwareness, 'unassessed');
  assert.strictEqual(report.metaphysicalClaimEstablished, false);
});

test('perception maps body and world without phenomenal access', () => {
  const report = phenomenologyService.perception({
    agentId: 'agent-1', body: 'workspace-1', world: 'mission-env'
  });
  assert.strictEqual(report.body, 'workspace-1');
  assert.strictEqual(report.world, 'mission-env');
  assert.strictEqual(report.embodiment.bodyProper, true);
  assert.strictEqual(report.subjectiveAwareness, 'unassessed');
  assert.strictEqual(report.metaphysicalClaimEstablished, false);
});

test('existencePrecedesEssence retains its bounded descriptive mapping', () => {
  const report = phenomenologyService.existencePrecedesEssence({
    agentId: 'agent-1', status: 'idle', role: 'orchestrator'
  });
  assert.strictEqual(report.existence, true);
  assert.strictEqual(report.existenceBeforeEssence, true);
  assert.strictEqual(report.badFaith, true);
  assert.strictEqual(report.freedom, 'condemned_to_be_free');
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exitCode = 1;
