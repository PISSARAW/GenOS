'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'morphology-test-secret';
const learning = require('../src/services/morphogenesis/morphologyLearningService');

function signedEvidence({ receiptId, kind, success, value }) {
  const evidenceDigest = crypto.createHash('sha256')
    .update(JSON.stringify({ success, value, kind })).digest('hex');
  const verifierDigest = require('../src/services/verifierTrustRegistry').listVerifierDigests()[0];
  const receipt = require('../src/services/epistemicVerifierReceiptService').issueReceipt({
    resultId: receiptId, evidenceDigest, verifierDigest, independent: true, status: 'verified'
  });
  return { status: 'VERIFIED', kind, receiptId, success, value, receipt };
}

function main() {
  learning._internals.experiences.length = 0;
  const base = {
    problemFeatures: { complexity: 0.5, domain: 'software' },
    morphology: { capabilities: ['ADAPTIVE'], topology: 'flat' },
    outcome: { success: true, quality: 1 }, evidenceQuality: 1,
  };
  assert.equal(learning.recordExperience(base), null, 'an outcome without evidence is not learned');
  assert.equal(learning.getStats().totalExperiences, 0);
  assert.equal(learning.recordExperience({ ...base, outcomeEvidence: {
    status: 'VERIFIED', kind: 'llm_self_report', receiptId: 'untrusted', success: true, value: 1,
  } }), null, 'self-reported evidence cannot enter learning');
  const result = learning.recordExperience({ ...base, outcomeEvidence: {
    ...signedEvidence({ receiptId: 'receipt:test:1', kind: 'deterministic_verifier', success: false, value: 0.2 })
  } });
  assert.ok(result);
  assert.equal(result.outcome.success, false);
  assert.equal(result.outcome.quality, 0.2);
  assert.equal(learning.getStats().totalExperiences, 1);
  console.log('Morphology learning evidence gate: PASS');
}

main();
