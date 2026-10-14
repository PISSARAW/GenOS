'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'trinity-variant-security-test-secret';
const assert = require('node:assert/strict');
const adversarial = require('../src/services/trinityAdversarialCrossExamination');
const receipts = require('../src/services/epistemicVerifierReceiptService');
const verifiers = require('../src/services/verifierTrustRegistry');

const receipt = receipts.issueReceipt({ resultId: 'defense-evidence', status: 'verified', independent: true,
  evidenceDigest: `sha256:${'b'.repeat(64)}`, verifierDigest: verifiers.getVerifier('testResult').digest,
  independenceDescriptor: { actorId: 'defense-verifier', workspaceId: 'world-1' } });
const gate = adversarial.evidenceGateForWorlds([
  { worldNumber: 1, report: { evidence: [{ id: 'proof-1', verificationReceipt: receipt }] } },
  { worldNumber: 2, report: { evidence: [{ id: 'proof-2', verificationReceipt: { ...receipt, signature: '0'.repeat(64) } }] } }
]);
assert.equal(gate.passes(['proof-1'], 1), true);
assert.equal(gate.passes(['proof-1'], 2), false, 'evidence from another defender cannot be borrowed');
assert.equal(gate.passes(['proof-2'], 2), false, 'forged receipts cannot substantiate a refutation');
const attack = [{ id: 'a1', targetWorld: 1, severity: 'major' }];
const defense = [{ attackId: 'a1', targetWorld: 1, response: 'refute', evidence: ['invented-proof'] }];
assert.equal(adversarial.adjudicate(attack, defense, [gate])[0].verdict,
  'attack_stands_insufficient_evidence');
const conceded = adversarial.enforceVariantGate({ canMerge: true, outcome: 'PROMOTE_WORLD' }, {
  phase: 'complete', attacks: [{ id: 'a1' }], adjudication: [{ attackId: 'a1', verdict: 'conceded' }]
});
assert.equal(conceded.canMerge, false, 'a concession cannot preserve the pre-review synthesis');
console.log('Trinity adversarial evidence gate: PASS');
