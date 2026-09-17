'use strict';

const assert = require('assert');
const guard = require('../src/services/philosophicalPromotionGuard');
const promotionPolicy = require('../src/services/strategyPromotionPolicyService');

const philosophy = guard.buildContext({
  references: [{
    conceptId: 'metaphysics.qualia',
    interpretationStatus: 'contested',
    evidenceStatus: 'documented',
    provenanceRefs: ['docs/01-concepts/conscience-esprit-mental.md']
  }],
  provenanceHash: 'sha256:philosophy-context'
});
assert.equal(philosophy.interpretationStatus, 'interpretive');
assert.equal(philosophy.policy.interpretiveRequiresVerifiedEvidence, true);

const contract = { philosophy, promotion: {} };
const blocked = promotionPolicy.evaluatePromotionGate(contract, {});
assert.equal(blocked.eligible, false);
assert.ok(blocked.violations.some((violation) => (
  violation.policy === 'interpretive_philosophy_requires_verified_evidence'
)));

const supported = promotionPolicy.evaluatePromotionGate(contract, {
  independentVerification: true
});
assert.equal(supported.eligible, true);

const metadata = guard.memoryMetadata(philosophy);
assert.deepEqual(metadata.references, ['metaphysics.qualia']);
assert.equal(metadata.interpretationStatus, 'interpretive');
assert.equal(metadata.provenanceHash, 'sha256:philosophy-context');

assert.throws(
  () => guard.buildContext({ references: ['missing.philosophical-concept'] }),
  /Unknown philosophical concept/
);

console.log('Philosophical promotion guard tests passed.');
