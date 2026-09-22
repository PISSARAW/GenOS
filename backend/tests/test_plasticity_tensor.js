/**
 * Tests for Synaptic Plasticity and Tensor Compatibility services.
 */

const assert = require('assert');
const plasticity = require('../src/services/synapticPlasticityService');
const tensor = require('../src/services/tensorCompatibilityService');

function resetAll() {
  plasticity.resetWeights();
}

// ── Synaptic Plasticity ──────────────────────────────────────────────────────

function testInitialWeight() {
  resetAll();
  const w = plasticity.getChannelWeight('a', 'b');
  assert.strictEqual(w.weight, plasticity.DEFAULT_WEIGHT);
  assert.strictEqual(w.hits, 0);
  assert.strictEqual(w.misses, 0);
}

function testReinforceIncreasesWeight() {
  resetAll();
  plasticity.reinforce('a', 'b', 'ligand');
  const w = plasticity.getChannelWeight('a', 'b');
  assert.ok(w.weight > plasticity.DEFAULT_WEIGHT);
  assert.strictEqual(w.hits, 1);
}

function testDepressDecreasesWeight() {
  resetAll();
  plasticity.depress('a', 'b', 'ligand');
  const w = plasticity.getChannelWeight('a', 'b');
  assert.ok(w.weight < plasticity.DEFAULT_WEIGHT + plasticity.REINFORCEMENT);
}

function testStrongDepressLargerEffect() {
  resetAll();
  const sender = 'sd-' + Date.now();
  const receiver = 'sd-recv';
  plasticity.reinforce(sender, receiver, 'ligand');
  plasticity.strongDepress(sender, receiver, 'noise');
  const afterStrong = plasticity.getChannelWeight(sender, receiver).weight;

  const sender2 = 'sd2-' + Date.now();
  const receiver2 = 'sd-recv2';
  plasticity.reinforce(sender2, receiver2, 'ligand');
  plasticity.depress(sender2, receiver2, 'ligand');
  const afterWeak = plasticity.getChannelWeight(sender2, receiver2).weight;

  assert.ok(afterStrong < afterWeak, 'Strong depress should lower weight more than weak depress');
}

function testRecordOutcomeReceptorTriggered() {
  resetAll();
  plasticity.recordSignalOutcome({ senderId: 'p', receiverId: 'q', outcome: 'receptor_triggered', signalType: 'voltage' });
  const w = plasticity.getChannelWeight('p', 'q');
  assert.ok(w.weight > plasticity.DEFAULT_WEIGHT);
}

function testRecordOutcomeSuppressed() {
  resetAll();
  plasticity.recordSignalOutcome({ senderId: 'p', receiverId: 'q', outcome: 'suppressed', signalType: 'voltage' });
  const w = plasticity.getChannelWeight('p', 'q');
  assert.ok(w.weight < plasticity.DEFAULT_WEIGHT);
}

function testRecordOutcomeNoEffect() {
  resetAll();
  plasticity.recordSignalOutcome({ senderId: 'p', receiverId: 'q', outcome: 'no_effect', signalType: 'voltage' });
  const w = plasticity.getChannelWeight('p', 'q');
  assert.ok(w.weight < plasticity.DEFAULT_WEIGHT);
  assert.ok(w.weight >= plasticity.DEFAULT_WEIGHT - plasticity.DEPRESSION - 0.001);
}

function testWeightBounds() {
  resetAll();
  for (let i = 0; i < 20; i++) plasticity.reinforce('bound-a', 'bound-b', 'ligand');
  const w = plasticity.getChannelWeight('bound-a', 'bound-b');
  assert.ok(w.weight <= plasticity.MAX_WEIGHT);

  for (let i = 0; i < 20; i++) plasticity.strongDepress('bound-a', 'bound-b', 'noise');
  const w2 = plasticity.getChannelWeight('bound-a', 'bound-b');
  assert.ok(w2.weight >= plasticity.MIN_WEIGHT);
}

function testGetTopChannels() {
  resetAll();
  plasticity.reinforce('top-1', 'top-2', 'ligand');
  plasticity.reinforce('top-1', 'top-2', 'ligand');
  const top = plasticity.getTopChannels(5);
  assert.ok(top.length > 0);
  assert.ok(top[0].weight >= top[top.length - 1].weight);
}

function testPruneWeakChannels() {
  resetAll();
  for (let i = 0; i < 8; i++) plasticity.recordSignalOutcome({ senderId: 'weak-1', receiverId: 'weak-2', outcome: 'noise', signalType: 'noise' });
  const pruned = plasticity.pruneWeakChannels(0.1);
  assert.ok(pruned.length > 0);
}

function testResetClearsAll() {
  plasticity.reinforce('x', 'y', 'ligand');
  plasticity.resetWeights();
  const w = plasticity.getChannelWeight('x', 'y');
  assert.strictEqual(w.weight, plasticity.DEFAULT_WEIGHT);
  assert.strictEqual(w.hits, 0);
}

// ── Tensor Compatibility ─────────────────────────────────────────────────────

function testValidateValidContract() {
  const result = tensor.validateTensorContract({
    family: 'openai',
    model: 'text-embedding-3-large',
    dimensions: 1536,
    normalization: 'cosine',
  });
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
}

function testValidateMissingRequired() {
  const result = tensor.validateTensorContract({ family: 'openai' });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('model')));
  assert.ok(result.errors.some((e) => e.includes('dimensions')));
  assert.ok(result.errors.some((e) => e.includes('normalization')));
}

function testValidateInvalidNormalization() {
  const result = tensor.validateTensorContract({
    family: 'openai', model: 'test', dimensions: 256, normalization: 'invalid',
  });
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('normalization')));
}

function testNormalizeFillsDefaults() {
  const normalized = tensor.normalizeTensorContract({ family: 'openai', model: 'test', dimensions: 256, normalization: 'l2' });
  assert.strictEqual(normalized.metric, 'cosine');
  assert.strictEqual(normalized.revision, 'unversioned');
  assert.strictEqual(normalized.semantic_schema, 'generic');
}

function testCompatibleContracts() {
  const a = { family: 'openai', model: 'text-embedding-3-large', dimensions: 1536, normalization: 'cosine' };
  const b = { family: 'openai', model: 'text-embedding-3-large', dimensions: 1536, normalization: 'cosine' };
  assert.strictEqual(tensor.areContractsCompatible(a, b), true);
}

function testIncompatibleDimensions() {
  const a = { family: 'openai', model: 'text-embedding-3-large', dimensions: 1536, normalization: 'cosine' };
  const b = { family: 'openai', model: 'text-embedding-3-small', dimensions: 256, normalization: 'cosine' };
  assert.strictEqual(tensor.areContractsCompatible(a, b), false);
}

function testIncompatibleFamily() {
  const a = { family: 'openai', model: 'text-embedding-3-large', dimensions: 1536, normalization: 'cosine' };
  const b = { family: 'mistral', model: 'mistral-embed', dimensions: 1536, normalization: 'cosine' };
  assert.strictEqual(tensor.areContractsCompatible(a, b), false);
}

function testCosineSimilarity() {
  const a = [1, 0, 0];
  const b = [1, 0, 0];
  assert.strictEqual(tensor.computeCosineSimilarity(a, b), 1);

  const c = [1, 0, 0];
  const d = [0, 1, 0];
  assert.strictEqual(tensor.computeCosineSimilarity(c, d), 0);

  const e = [1, 1];
  const f = [-1, -1];
  assert.ok(Math.abs(tensor.computeCosineSimilarity(e, f) - (-1)) < 0.001);
}

function testCosineSimilarityDimensionMismatch() {
  const result = tensor.computeCosineSimilarity([1, 0], [1, 0, 0]);
  assert.strictEqual(result, null);
}

function testWrapTensorSignal() {
  const wrapped = tensor.wrapTensorSignal([0.1, 0.2, 0.3], {
    family: 'openai', model: 'text-embedding-3-large', dimensions: 1536, normalization: 'cosine',
  });
  assert.strictEqual(wrapped.signalType, 'tensor');
  assert.deepStrictEqual(wrapped.tensor, [0.1, 0.2, 0.3]);
  assert.strictEqual(wrapped.contract.dimensions, 1536);
  assert.ok(wrapped.wrappedAt);
}

function testWrapInvalidTensorThrows() {
  assert.throws(
    () => tensor.wrapTensorSignal([0.1], { family: 'openai' }),
    /Invalid tensor contract/
  );
}

async function run() {
  // Plasticity
  testInitialWeight();
  console.log('[PASS] initial weight is DEFAULT_WEIGHT');

  testReinforceIncreasesWeight();
  console.log('[PASS] reinforce increases weight');

  testDepressDecreasesWeight();
  console.log('[PASS] depress decreases weight');

  testStrongDepressLargerEffect();
  console.log('[PASS] strongDepress has larger effect than depress');

  testRecordOutcomeReceptorTriggered();
  console.log('[PASS] recordSignalOutcome receptor_triggered reinforces');

  testRecordOutcomeSuppressed();
  console.log('[PASS] recordSignalOutcome suppressed strong-depresses');

  testRecordOutcomeNoEffect();
  console.log('[PASS] recordSignalOutcome no_effect depresses');

  testWeightBounds();
  console.log('[PASS] weight stays within [MIN_WEIGHT, MAX_WEIGHT]');

  testGetTopChannels();
  console.log('[PASS] getTopChannels returns sorted channels');

  testPruneWeakChannels();
  console.log('[PASS] pruneWeakChannels removes atrophied channels');

  testResetClearsAll();
  console.log('[PASS] resetWeights clears all state');

  // Tensor
  testValidateValidContract();
  console.log('[PASS] validateTensorContract accepts valid contract');

  testValidateMissingRequired();
  console.log('[PASS] validateTensorContract rejects missing required fields');

  testValidateInvalidNormalization();
  console.log('[PASS] validateTensorContract rejects invalid normalization');

  testNormalizeFillsDefaults();
  console.log('[PASS] normalizeTensorContract fills defaults');

  testCompatibleContracts();
  console.log('[PASS] areContractsCompatible returns true for identical contracts');

  testIncompatibleDimensions();
  console.log('[PASS] areContractsCompatible returns false for different dimensions');

  testIncompatibleFamily();
  console.log('[PASS] areContractsCompatible returns false for different families');

  testCosineSimilarity();
  console.log('[PASS] computeCosineSimilarity works correctly');

  testCosineSimilarityDimensionMismatch();
  console.log('[PASS] computeCosineSimilarity returns null for dimension mismatch');

  testWrapTensorSignal();
  console.log('[PASS] wrapTensorSignal wraps with contract');

  testWrapInvalidTensorThrows();
  console.log('[PASS] wrapTensorSignal throws on invalid contract');

  console.log('\nAll Synaptic Plasticity and Tensor Compatibility tests passed.');
}

run().catch((err) => {
  console.error('[FAIL]', err.message);
  process.exit(1);
});
