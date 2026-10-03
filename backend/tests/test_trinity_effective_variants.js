'use strict';

// ADR 0279: variants must change worlds, not labels.
const assert = require('node:assert/strict');
const trinity = require('../src/services/trinityService');
const adapters = require('../src/services/trinityAdapters');
const policy = require('../src/services/modelRoutingPolicy');
const payload = require('../bin/workerLaunchPayload.cjs');

const INSTALLED = adapters.installedAdapterNames();
const MODELS = ['ollama://qwen2.5-coder:7b', 'ollama://llama3.1:8b', 'ollama://deepseek-coder-v2:latest'];

function testHeterogeneous() {
  const members = trinity.compose('Lance Trinity pour comparer trois tris.', {
    variantId: 'heterogeneous', availableAdapters: INSTALLED, trinityModels: MODELS
  });
  const recipes = members.map((m) => m.cognitiveRecipe);
  assert.deepEqual(recipes, ['direct', 'planned', 'adversarial']);
  assert.deepEqual(members.map((m) => m.variantIndex), [0, 1, 2]);
  const diversity = members[0].variantSelection.diversity;
  assert.ok(diversity && typeof diversity.minPairwiseDiversity === 'number');
  assert.ok(members[0].mission.includes('Cognitive recipe: direct'));
}

function testDiversityDiscriminates() {
  const varied = trinity.compose('Lance Trinity pour comparer trois tris.', {
    variantId: 'heterogeneous', availableAdapters: INSTALLED, trinityModels: MODELS
  });
  const same = trinity.compose('Lance Trinity pour comparer trois tris.', {
    variantId: 'heterogeneous', availableAdapters: INSTALLED, trinityModels: [MODELS[0], MODELS[0], MODELS[0]]
  });
  const variedScore = varied[0].variantSelection.diversity.minPairwiseDiversity;
  const sameScore = same[0].variantSelection.diversity.minPairwiseDiversity;
  assert.ok(variedScore > sameScore, `diverse ${variedScore} must beat uniform ${sameScore}`);
}

function testPareto() {
  const members = trinity.compose('Lance Trinity avec coût et latence Pareto.', {
    variantId: 'pareto', availableAdapters: INSTALLED
  });
  const profiles = members.map((m) => m.objectiveProfile);
  assert.deepEqual(profiles, ['quality_focus', 'efficiency_focus', 'risk_focus']);
  assert.ok(members[1].mission.includes('Optimization axis: efficiency_focus'));
}

function testAdversarial() {
  const members = trinity.compose('Lance Trinity pour attaquer cette menace.', {
    variantId: 'adversarial', availableAdapters: INSTALLED
  });
  assert.equal(members[2].role, 'adversarial_reviewer');
  assert.ok(members[2].hypothesis.includes('falsifiable'));
}

function testControlledUnchanged() {
  const members = trinity.compose('Lance Trinity mission contrôlée.', { variantId: 'controlled' });
  assert.deepEqual(members.map((m) => m.cognitiveRecipe), ['direct', 'planned', 'self_correcting']);
  assert.ok(members.every((m) => m.objectiveProfile === null));
  assert.equal(members[2].role, 'self_correcting_implementation');
}

function testBridgeAdaptersAccepted() {
  const members = trinity.compose('Lance Trinity pour attaquer cette menace.', {
    variantId: 'adversarial', availableAdapters: INSTALLED
  });
  assert.equal(members[0].variant, 'adversarial');
}

function testPayloadForwards() {
  const built = payload.workerLaunchPayload({
    context: { request: {}, orchestratorId: 'orch1' },
    member: { mission: 'm', role: 'basic_implementation', workerKind: 'bounded_worker', variantIndex: 2, localModel: MODELS[1] },
    workerId: 'w1', parent: {}
  });
  assert.equal(built.variantIndex, 2);
  assert.equal(built.localModel, MODELS[1]);
}

function testModelRotation() {
  const models = [{ uri: 'ollama://a:7b', model: 'a:7b' }, { uri: 'ollama://b:8b', model: 'b:8b' }];
  const first = policy.pickAutoCandidate(models, 'high', 0);
  const second = policy.pickAutoCandidate(models, 'high', 1);
  assert.notEqual(first.uri, second.uri);
}

async function main() {
  testHeterogeneous();
  testDiversityDiscriminates();
  testPareto();
  testAdversarial();
  testControlledUnchanged();
  testBridgeAdaptersAccepted();
  testPayloadForwards();
  testModelRotation();
  console.log('✅ Trinity effective variant tests passed.');
}

main().catch((error) => { console.error(error); process.exit(1); });
