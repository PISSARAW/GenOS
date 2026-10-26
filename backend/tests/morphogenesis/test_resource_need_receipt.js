'use strict';

const assert = require('node:assert/strict');
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'resource-need-test-secret';
const receipts = require('../../src/services/morphogenesis/resourceNeedReceipt');
const signer = require('../../src/services/epistemicVerifierReceiptService');
const trust = require('../../src/services/verifierTrustRegistry');

function signedNeed(context) {
  const need = { id: 'need-1', requestedTokens: 32, minimumTokens: 8,
    marginalValue: 0.8, confidence: 0.9, evidenceRefs: ['need-proof'] };
  const binding = { groupId: 'group-1', workerId: 'worker-1', need, context };
  const digest = receipts.digestFor(binding);
  const proof = signer.issueReceipt({ resultId: 'need-proof', evidenceDigest: digest,
    verifierDigest: trust.getVerifier('benchmark').digest, independent: true,
    independenceDescriptor: { actorId: 'oracle', workspaceId: 'resource-measurement' } });
  return { ...binding, need: { ...need, proofReceipts: [proof] } };
}

function testReceiptRequiresStableMissionContext() {
  const context = { missionId: 'mission-1', promptDigest: `sha256:${'a'.repeat(64)}` };
  const input = signedNeed(context);
  assert.ok(receipts.bindNeed(input));
  assert.equal(receipts.bindNeed({ ...input, context: {
    missionId: 'mission-2', promptDigest: context.promptDigest } }), null);
  assert.equal(receipts.bindNeed({ ...input, context: null }), null);
}

testReceiptRequiresStableMissionContext();
process.stdout.write('resource need receipt tests passed\n');
