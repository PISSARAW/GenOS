'use strict';

const assert = require('assert');
const { evaluateKeystoneImpact } = require('../src/services/holobionte/resilience/keystoneSymbiontService');

function testMeasuredImpactOutweighsTraffic() {
  const result = evaluateKeystoneImpact({
    symbiontId: 'schema-translator', benchmarkId: 'paired-mission-set',
    withSymbiont: { score: 0.92, evidenceRefs: ['proof:with'] },
    withoutSymbiont: { score: 0.18, evidenceRefs: ['proof:without'] },
    usageFrequency: 0.01
  });
  assert.strictEqual(result.impact, 0.74);
  assert.strictEqual(result.isKeystone, true);
  assert.strictEqual(result.usageFrequency, 0.01);
  assert.deepStrictEqual(result.evidenceRefs, ['proof:with', 'proof:without']);
}

function testLowImpactAndMissingEvidence() {
  const result = evaluateKeystoneImpact({
    symbiontId: 'optional-helper', benchmarkId: 'paired-mission-set',
    withSymbiont: { score: 0.8, evidenceRefs: ['proof:with'] },
    withoutSymbiont: { score: 0.75, evidenceRefs: ['proof:without'] }
  });
  assert.strictEqual(result.isKeystone, false);
  assert.throws(() => evaluateKeystoneImpact({
    symbiontId: 'unknown-impact', benchmarkId: 'paired-mission-set',
    withSymbiont: { score: 0.8, evidenceRefs: [] },
    withoutSymbiont: { score: 0.2, evidenceRefs: ['proof:without'] }
  }), { code: 'HOLOBIONT_EVIDENCE_REQUIRED' });
}

testMeasuredImpactOutweighsTraffic();
testLowImpactAndMissingEvidence();
console.log('✅ Holobiont keystone tests passed.');
