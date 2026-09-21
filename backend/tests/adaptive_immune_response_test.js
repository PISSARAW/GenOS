'use strict';

const assert = require('node:assert');
const air = require('../src/services/epistemic/adaptiveImmuneResponse');

// ---- assembly ----

const empty = air.assembleAntigen({});

assert.strictEqual(empty.state, 'unrecognized');
assert.ok(typeof empty.id === 'string');
assert.strictEqual(empty.claim, '(sans affirmation)');

const fromClaim = air.assembleAntigen({ claim: 'X > 3' });
assert.strictEqual(fromClaim.claim, 'X > 3');

// ---- pipeline ----

const pipeline = air.runAdaptivePipeline({
  claim: 'p < 0.05 suffit',
  epitopes: {
    evidence: { kind: 'test_result', digest: 'sha256:abc' },
    assumptions: ['p value only'],
  },
});
assert.ok(pipeline.decision);
assert.ok(Array.isArray(pipeline.decision.assignedVerifiers));
assert.ok(pipeline.decision.verifierCatalogSnapshot.length >= 1);
assert.ok(pipeline.summary);

// ---- validate ----

assert.deepStrictEqual(air.validatePipelineInput({ claim: 'ok' }), { valid: true });
assert.deepStrictEqual(air.validatePipelineInput({ formalResult: {} }), { valid: true });
assert.ok(!air.validatePipelineInput({}).valid);
assert.ok(!air.validatePipelineInput({ claim: 3 }).valid);
assert.ok(!air.validatePipelineInput({ claim: '' }).valid);
assert.ok(air.validatePipelineInput({ claim: '', formalResult: {} }).valid);
assert.ok(!air.validatePipelineInput({ claim: 'ok', epitopes: 'bad' }).valid);
assert.ok(!air.validatePipelineInput({ claim: 'ok', risk: { score: 'bad' } }).valid);
assert.ok(air.validatePipelineInput({ claim: 'ok', risk: { score: 0.5 } }).valid);

// ---- catalog accessible ----

assert.ok(typeof air.defaultCatalog === 'function');
const cat = air.defaultCatalog();
assert.strictEqual(Object.keys(cat).length, 6);

console.log('OK adaptiveImmuneResponse');
