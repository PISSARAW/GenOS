'use strict';

const assert = require('assert');
const { METRICS, buildFitnessVector } = require('../src/services/holobionte/fitness/holobiontFitnessVectorService');

function metrics() {
  return Object.fromEntries(METRICS.map((key, index) => [key, index / (METRICS.length - 1)]));
}

function testVectorRetainsIndependentDimensions() {
  const vector = buildFitnessVector({ metrics: metrics(), evidenceRefs: ['proof:mission', 'proof:mission'] });
  assert.strictEqual(vector.metrics.dependencyRisk, 6 / 9);
  assert.strictEqual(vector.metrics.functionalRedundancy, 8 / 9);
  assert.strictEqual(vector.aggregateScore, null);
  assert.deepStrictEqual(vector.evidenceRefs, ['proof:mission']);
}

function testInvalidOrUnevidencedVector() {
  assert.throws(() => buildFitnessVector({ metrics: metrics() }), { code: 'HOLOBIONT_EVIDENCE_REQUIRED' });
  assert.throws(() => buildFitnessVector({ metrics: { ...metrics(), safety: 1.1 }, evidenceRefs: ['proof'] }), {
    code: 'HOLOBIONT_FITNESS_INVALID'
  });
}

testVectorRetainsIndependentDimensions();
testInvalidOrUnevidencedVector();
console.log('✅ Holobiont fitness vector tests passed.');
