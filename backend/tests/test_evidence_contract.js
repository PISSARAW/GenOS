'use strict';

const assert = require('node:assert/strict');
const {
  EvidenceState,
  createEnvelope,
  digest,
  promoteEnvelope,
  replayEnvelope,
  signEnvelope,
  verifyEnvelope
} = require('../src/services/evidenceContractService');

const { privateKey, publicKey } = require('node:crypto').generateKeyPairSync('ed25519');
const input = { mission: 'sensorium', values: [2, 1] };
const output = { accepted: true, score: 0.91 };
const envelope = createEnvelope({ sourceId: 'test-adapter', captureId: 'capture-1', input, output });

assert.equal(envelope.state, EvidenceState.SYNTHETIC);
assert.equal(replayEnvelope(envelope, input, output), true);
assert.equal(replayEnvelope(envelope, input, { accepted: false }), false);

const observed = promoteEnvelope(envelope, EvidenceState.OBSERVED);
const verified = promoteEnvelope(observed, EvidenceState.VERIFIED, {
  verifierId: 'independent-verifier', verificationRef: 'verification-1'
});
assert.equal(verified.state, EvidenceState.VERIFIED);
assert.throws(() => promoteEnvelope(envelope, EvidenceState.VERIFIED), /invalid evidence promotion/);
assert.throws(() => promoteEnvelope(verified, EvidenceState.OBSERVED), /invalid evidence promotion/);

const signed = signEnvelope(verified, privateKey, 'signer-1');
assert.equal(verifyEnvelope(signed, publicKey), true);
const tampered = { ...signed, output: { accepted: false } };
assert.throws(() => verifyEnvelope(tampered, publicKey), /digest mismatch/);
assert.equal(typeof digest(input), 'string');

const rejected = promoteEnvelope(observed, EvidenceState.REJECTED, { rejectionReason: 'insufficient evidence' });
assert.equal(rejected.state, EvidenceState.REJECTED);
console.log('Evidence contract states, signatures and replay: PASS');
