'use strict';

const assert = require('node:assert/strict');
const { buildPromotionPolicy } = require('../src/services/philosophyPromotionPolicyService');
const { buildContext } = require('../src/services/philosophicalPromotionGuard');
const { evaluatePromotionGate } = require('../src/services/strategyPromotionPolicyService');
const { issueReceipt } = require('../src/services/epistemicVerifierReceiptService');

const philosophyContext = buildContext({ references: [{ conceptId: 'metaphysics.qualia' }] });
const contract = {
  promotion: {
    require_independent_verification: false,
    require_philosophical_provenance: true,
    block_unverified_interpretation: true
  },
  philosophy: philosophyContext,
  philosophical_context: buildPromotionPolicy({ philosophyContext: { concepts: [{ conceptId: 'metaphysics.qualia', provenance: { version: '1.0.0', sourceType: 'genos' } }] } })
};

const blocked = evaluatePromotionGate(contract, { report: { claims: [] } });
assert.equal(blocked.eligible, false);
assert.ok(blocked.violations.some((violation) => violation.policy.includes('philosophy')));

const declared = evaluatePromotionGate(contract, {
  independentVerification: true,
  report: { claims: [{ statement: 'verified', evidence: ['test-receipt'] }] }
});
assert.equal(declared.eligible, false, 'an independence flag is not a verifier receipt');

const verifierDigest = `sha256:${'b'.repeat(64)}`;
const previousSecret = process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
let receipt;
try {
  process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'test-philosophy-receipt-only';
  receipt = issueReceipt({
    resultId: 'test-result', evidenceDigest: `sha256:${'a'.repeat(64)}`,
    verifierDigest, independent: true
  });
  const verifiedContext = {
    independentVerifierReceipt: receipt, trustedVerifierDigests: [verifierDigest],
    report: { claims: [{ statement: 'fixture verified', evidence: ['test-receipt'] }] }
  };
  const verified = evaluatePromotionGate(contract, verifiedContext);
  assert.equal(verified.eligible, true);
  assert.equal(evaluatePromotionGate(contract, { ...verifiedContext, trustedVerifierDigests: [] }).eligible, false);
  assert.equal(evaluatePromotionGate(contract, {
    ...verifiedContext, independentVerifierReceipt: { ...receipt, signature: '0'.repeat(64) }
  }).eligible, false);
} finally {
  if (previousSecret === undefined) delete process.env.GENOS_EPISTEMIC_RECEIPT_SECRET;
  else process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = previousSecret;
}

const policy = buildPromotionPolicy({ philosophyContext: { concepts: [{ conceptId: 'metaphysics.qualia', provenance: { sourceType: 'genos' } }] } });
assert.equal(policy.provenanceComplete, false);

console.log('Philosophical promotion provenance tests passed.');
