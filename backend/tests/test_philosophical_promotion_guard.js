'use strict';

const assert = require('assert');
const guard = require('../src/services/philosophicalPromotionGuard');
const promotionPolicy = require('../src/services/strategyPromotionPolicyService');
const { issueReceipt, validateReceipt } = require('../src/services/epistemicVerifierReceiptService');

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

const declared = promotionPolicy.evaluatePromotionGate(contract, {
  independentVerification: true
});
assert.equal(declared.eligible, false, 'An independence flag cannot replace a verifier receipt');

const verifierDigest = `sha256:${'b'.repeat(64)}`;
const previousSecret = process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
try {
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'test-philosophical-guard-only';
  const receipt = issueReceipt({
    resultId: 'guard-fixture-result', evidenceDigest: `sha256:${'a'.repeat(64)}`,
    verifierDigest, independent: true
  });
  const context = { independentVerifierReceipt: receipt, trustedVerifierDigests: [verifierDigest] };
  assert.equal(promotionPolicy.evaluatePromotionGate(contract, context).eligible, true);
  for (const status of ['refuted', 'inconclusive']) {
    const negativeReceipt = issueReceipt({ ...receipt, status });
    assert.equal(validateReceipt(negativeReceipt, [verifierDigest]), true);
    assert.equal(promotionPolicy.evaluatePromotionGate(contract, {
      ...context, independentVerifierReceipt: negativeReceipt
    }).eligible, false, 'A signed negative result must not authorize promotion');
  }
  assert.equal(promotionPolicy.evaluatePromotionGate(contract, { ...context, trustedVerifierDigests: [] }).eligible, false);
  assert.equal(promotionPolicy.evaluatePromotionGate(contract, {
    ...context, independentVerifierReceipt: { ...receipt, signature: '0'.repeat(64) }
  }).eligible, false);
} finally {
  if (previousSecret === undefined) delete process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
  else process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = previousSecret;
}

const metadata = guard.memoryMetadata(philosophy);
assert.deepEqual(metadata.references, ['metaphysics.qualia']);
assert.equal(metadata.interpretationStatus, 'interpretive');
assert.equal(metadata.provenanceHash, 'sha256:philosophy-context');

assert.throws(
  () => guard.buildContext({ references: ['missing.philosophical-concept'] }),
  /Unknown philosophical concept/
);

console.log('Philosophical promotion guard tests passed.');
