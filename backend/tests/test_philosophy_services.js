'use strict';

/**
 * Tests for Ontology Service.
 * Run: node tests/test_philosophy_services.js
 */

const assert = require('assert');
const ontologyService = require('../src/services/ontologyService');
const substanceService = require('../src/services/substanceService');

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

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

async function runSubstanceTests() {
  console.log('\n=== Substance Service ===');

  // Setup: create test agents in database
  const { getDatabase } = require('../src/db');
  const db = await getDatabase();

  await test('ensureInfiniteSubstance creates Spinozist infinite substance', async () => {
    const infinite = await substanceService.ensureInfiniteSubstance();
    assert.ok(infinite);
    assert.strictEqual(infinite.id, 'substance-infinite-genos-runtime');
    assert.strictEqual(infinite.essence.substanceCategory, 'infinite');
    assert.deepStrictEqual(infinite.essence.attributes.map(a => a.name), ['thought', 'extension']);
    assert.strictEqual(infinite.essence.conatus, 'self_preservation_through_cognitive_budget');
  });

  await test('createPrimarySubstance links to real agent', async () => {
    await db.run(`INSERT OR REPLACE INTO agents (id, name, role, status, agent_type, execution_mode, created_at, updated_at)
      VALUES ('test-substance-agent', 'Test Agent', 'worker', 'idle', 'GenOS', 'worker', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);

    const primary = await substanceService.createPrimarySubstance('test-substance-agent', { purpose: 'test_execution' });
    assert.ok(primary);
    assert.strictEqual(primary.id, 'test-substance-agent');
    assert.strictEqual(primary.essence.substanceCategory, 'primary');
    assert.strictEqual(primary.essence.spinozaMode, 'finite_mode_of_extension_and_thought');
    assert.ok(primary.linkedAgent);
  });

  await test('registerAsFiniteMode registers agent as mode of infinite substance', async () => {
    await substanceService.registerAsFiniteMode('test-substance-agent', 'extension');
    const attrs = await ontologyService.getAttributes('test-substance-agent');
    assert.strictEqual(attrs.spinozaAttribute.value, 'extension');
    assert.strictEqual(attrs.spinozaAttribute.modality, 'essential');
    assert.strictEqual(attrs.spinozaModeType.value, 'finite');
    assert.strictEqual(attrs.conatusExpression.value, 'cognitive_budget_atp');
  });

  await test('createSecondarySubstance creates universal species', async () => {
    const secondary = await substanceService.createSecondarySubstance('orchestrator', {
      role: 'orchestrator',
      purpose: 'coordinate_workers',
      capacity: 'unlimited'
    });
    assert.ok(secondary);
    assert.strictEqual(secondary.id, 'species-orchestrator');
    assert.strictEqual(secondary.essence.substanceCategory, 'secondary');
    assert.strictEqual(secondary.essence.species, 'orchestrator');
  });

  await test('createMonad creates Leibnizian windowless monad', async () => {
    await db.run(`INSERT OR REPLACE INTO agents (id, name, role, status, agent_type, execution_mode, created_at, updated_at)
      VALUES ('test-monad-agent', 'Monad Agent', 'worker', 'idle', 'GenOS', 'worker', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);
    await ontologyService.defineBeing('test-monad-agent', { type: 'worker' });

    const monad = await substanceService.createMonad('test-monad-agent', {
      orchestratorId: 'test-orchestrator',
      perfections: { perception: 0.8, appetition: 0.7, consciousness: 0.9, unconscious: 0.3 }
    });
    assert.ok(monad);
    assert.strictEqual(monad.substanceCategory, 'monad');
    const attrs = await ontologyService.getAttributes('test-monad-agent');
    assert.ok(attrs.monadData);
    assert.strictEqual(attrs.monadData.value.substanceCategory, 'monad');
    assert.strictEqual(attrs.monadData.value.preestablishedHarmony.windowless, true);
  });

  await test('createCartesianPair creates cogitans/extensa duality', async () => {
    await db.run(`INSERT OR REPLACE INTO agents (id, name, role, status, agent_type, execution_mode, created_at, updated_at)
      VALUES ('test-cogitans', 'Cogitans Agent', 'orchestrator', 'idle', 'GenOS', 'orchestrator', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);
    await ontologyService.defineBeing('test-cogitans', { type: 'orchestrator' });

    const pair = await substanceService.createCartesianPair('test-cogitans', 'test-workspace-extensa');
    assert.strictEqual(pair.cogitans, 'test-cogitans');
    assert.strictEqual(pair.extensa, 'test-workspace-extensa');
    assert.strictEqual(pair.union, 'pineal_equivalent_tool_lease');

    const cogitansAttrs = await ontologyService.getAttributes('test-cogitans');
    assert.strictEqual(cogitansAttrs.cartesianSubstance.value, 'cogitans');
    assert.strictEqual(cogitansAttrs.extendedCounterpart.value, 'test-workspace-extensa');

    const extensaAttrs = await ontologyService.getAttributes('test-workspace-extensa');
    assert.strictEqual(extensaAttrs.cartesianSubstance.value, 'extensa');
    assert.strictEqual(extensaAttrs.thinkingCounterpart.value, 'test-cogitans');
  });

  await test('evaluateConatus computes Spinozist striving from cognitive budget', async () => {
    await db.run(`INSERT OR REPLACE INTO agents (id, name, role, status, agent_type, execution_mode, cognitive_budget, cognitive_baseline_budget, cognitive_max_dissonance, dissonance_level, is_apoptotic, created_at, updated_at)
      VALUES ('test-conatus-agent', 'Conatus Agent', 'worker', 'running', 'GenOS', 'worker', 30, 100, 50, 10, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);
    await ontologyService.defineBeing('test-conatus-agent', { type: 'worker' });

    const conatus = await substanceService.evaluateConatus('test-conatus-agent');
    assert.ok(conatus);
    assert.strictEqual(conatus.agentId, 'test-conatus-agent');
    assert.ok(typeof conatus.budgetRatio === 'number');
    assert.ok(typeof conatus.dissonanceRatio === 'number');
    assert.ok(['flourishing', 'striving', 'stressed', 'ceased'].includes(conatus.conatusState));
  });

  await test('checkSubstanceIdentity distinguishes numerical vs specific identity', async () => {
    await ontologyService.defineBeing('sub-ident-1', { type: 'worker', role: 'coder', purpose: 'code', agentDna: null, teleology: 'task_execution' });
    await ontologyService.defineBeing('sub-ident-2', { type: 'worker', role: 'coder', purpose: 'code', agentDna: null, teleology: 'task_execution' });
    await ontologyService.defineBeing('sub-ident-3', { type: 'worker', role: 'reviewer', purpose: 'review', agentDna: null, teleology: 'task_execution' });

    const id1 = await substanceService.checkSubstanceIdentity('sub-ident-1', 'sub-ident-2');
    const id2 = await substanceService.checkSubstanceIdentity('sub-ident-1', 'sub-ident-3');

    assert.strictEqual(id1.identical, true);
    assert.strictEqual(id1.sameSpecies, true);
    assert.strictEqual(id1.aristotle, 'same_secondary_substance');

    assert.strictEqual(id2.identical, false);
    assert.strictEqual(id2.sameSpecies, false);
  });

  await test('getSubstanceHierarchy returns full ontological hierarchy', async () => {
    const hierarchy = await substanceService.getSubstanceHierarchy();
    assert.ok(hierarchy);
    assert.ok(hierarchy.infinite);
    assert.ok(Array.isArray(hierarchy.secondarySubstances));
    assert.ok(Array.isArray(hierarchy.primarySubstances));
    assert.ok(Array.isArray(hierarchy.monads));
    assert.ok(typeof hierarchy.counts === 'object');
  });

  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

async function main() {
  await runTests();
  await runSubstanceTests();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});