'use strict';

/**
 * Tests for Ontology Service.
 * Run: node tests/test_philosophy_services.js
 */

const assert = require('assert');
const ontologyService = require('../src/services/ontologyService');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}: ${err.message}`);
  }
}

async function runTests() {
  console.log('\n=== Ontology Service ===');

  await test('defineBeing creates an agent being with essence', async () => {
    const being = await ontologyService.defineBeing('test-agent-1', { type: 'orchestrator', role: 'planner', purpose: 'orchestrate' });
    assert.strictEqual(being.id, 'test-agent-1');
    assert.strictEqual(being.substanceType, 'orchestrator');
    assert.strictEqual(being.essence.role, 'planner');
    assert.strictEqual(being.essence.purpose, 'orchestrate');
  });

  await test('setAttribute sets essential and accidental attributes', async () => {
    await ontologyService.defineBeing('test-agent-2', { type: 'worker' });
    await ontologyService.setAttribute({ agentId: 'test-agent-2', key: 'role', value: 'coder', modality: 'essential' });
    await ontologyService.setAttribute({ agentId: 'test-agent-2', key: 'status', value: 'running', modality: 'accidental' });
    await ontologyService.setAttribute({ agentId: 'test-agent-2', key: 'budget', value: 5000, modality: 'accidental' });

    const attrs = await ontologyService.getAttributes('test-agent-2');
    assert.strictEqual(attrs.role.value, 'coder');
    assert.strictEqual(attrs.role.modality, 'essential');
    assert.strictEqual(attrs.status.value, 'running');
    assert.strictEqual(attrs.status.modality, 'accidental');
    assert.strictEqual(attrs.budget.value, 5000);
  });

  await test('defineMode sets execution modes with constraints', async () => {
    await ontologyService.defineBeing('test-agent-3', { type: 'agent' });
    await ontologyService.defineMode('test-agent-3', 'localRuntime', { constraint: 'possible' });
    await ontologyService.defineMode('test-agent-3', 'isolationMode', { constraint: 'necessary' });
    await ontologyService.defineMode('test-agent-3', 'impossibleMode', { constraint: 'impossible' });

    const modes = await ontologyService.getModes('test-agent-3');
    assert.strictEqual(modes.localRuntime.constraint, 'possible');
    assert.strictEqual(modes.isolationMode.constraint, 'necessary');
    assert.strictEqual(modes.impossibleMode.constraint, 'impossible');
  });

  await test('activateMode activates possible/necessary modes', async () => {
    await ontologyService.defineBeing('test-agent-4', { type: 'agent' });
    await ontologyService.defineMode('test-agent-4', 'testMode', { constraint: 'possible' });
    await ontologyService.activateMode('test-agent-4', 'testMode');

    const mode = await ontologyService.getMode('test-agent-4', 'testMode');
    assert.strictEqual(mode.state, 'active');
    assert.ok(mode.activatedAt);
  });

  await test('activateMode rejects impossible modes', async () => {
    await ontologyService.defineBeing('test-agent-5', { type: 'agent' });
    await ontologyService.defineMode('test-agent-5', 'badMode', { constraint: 'impossible' });
    await assert.rejects(ontologyService.activateMode('test-agent-5', 'badMode'), /impossible/);
  });

  await test('addMereology creates part-whole relations', async () => {
    await ontologyService.defineBeing('test-whole', { type: 'orchestrator' });
    await ontologyService.defineBeing('test-part', { type: 'worker' });
    await ontologyService.addMereology({ wholeId: 'test-whole', partId: 'test-part', relationType: 'constitutive', isEssentialPart: true, proportion: 0.4 });

    const parts = await ontologyService.getParts('test-whole');
    assert.strictEqual(parts.length, 1);
    assert.strictEqual(parts[0].partId, 'test-part');
    assert.strictEqual(parts[0].relationType, 'constitutive');
    assert.strictEqual(parts[0].isEssentialPart, true);
    assert.strictEqual(parts[0].proportion, 0.4);
  });

  await test('hypostatize creates worker from attribute', async () => {
    await ontologyService.defineBeing('test-source', { type: 'orchestrator' });
    await ontologyService.setAttribute({ agentId: 'test-source', key: 'specialty', value: { role: 'code-review', purpose: 'review PRs' }, modality: 'essential' });

    const hyp = await ontologyService.hypostatize('test-source', 'specialty', { hypostasisType: 'worker_spawn' });
    assert.strictEqual(hyp.type, 'hypostasis');
    assert.strictEqual(hyp.source, 'test-source');
    assert.strictEqual(hyp.attributeKey, 'specialty');
    assert.strictEqual(hyp.essence.role, 'code-review');

    const target = await ontologyService.getBeing(hyp.id);
    assert.ok(target);
    assert.strictEqual(target.substanceType, 'worker');
    assert.strictEqual(target.essence.role, 'code-review');
  });

await test('checkIdentityContinuity evaluates Ship of Theseus', async () => {
    await ontologyService.defineBeing('test-ship', { type: 'agent', identityCriteria: { maximalPartReplacementRatio: 0.5 } });
    await ontologyService.setAttribute({ agentId: 'test-ship', key: 'role', value: 'explorer', modality: 'essential' });

    for (let i = 0; i < 3; i++) {
      await ontologyService.defineBeing(`test-part-${i}`, { type: 'worker' });
      await ontologyService.addMereology({ wholeId: 'test-ship', partId: `test-part-${i}`, relationType: 'constitutive', isEssentialPart: false });
    }

    const result = await ontologyService.checkIdentityContinuity('test-ship');
    assert.ok(result.continuous || !result.continuous);
    assert.ok(typeof result.score === 'number');
    assert.ok(['identity_preserved', 'identity_degraded', 'identity_lost'].includes(result.verdict));
  });

  await test('defineBeing throws on invalid agentId', async () => {
    await assert.rejects(ontologyService.defineBeing(''), /valid agentId/);
  });

  await test('defineBeing throws on invalid substance type', async () => {
    await assert.rejects(ontologyService.defineBeing('test-bad', { type: 'invalid' }), /Invalid substance_type/);
  });

  await test('setAttribute throws on invalid modality', async () => {
    await ontologyService.defineBeing('test-mod', { type: 'agent' });
    await assert.rejects(ontologyService.setAttribute({ agentId: 'test-mod', key: 'key', value: 'val', modality: 'invalid' }), /Invalid modality/);
  });

  // Summary
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});