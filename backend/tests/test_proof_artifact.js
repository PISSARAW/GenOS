'use strict';

const assert = require('node:assert');
const { createProofArtifact } = require('../src/services/mathematical/proofArtifact');

const art = createProofArtifact({
  type: 'lemma',
  statement: 'Every even n > 2 has at least one prime pair',
  domain: 'number_theory',
});
assert.ok(art.id);
assert.strictEqual(art.status, 'conjecture');
assert.strictEqual(art.isVerified(), false);

// Attach passing receipt
art.attachReceipt({
  status: 'passed',
  toolchainVersion: 'lean-4.9.0',
  environmentDigest: 'sha256:abcd',
  receiptDigest: 'sha256:ef01',
});
assert.strictEqual(art.isVerified(), true);
assert.strictEqual(art.status, 'verified');

// Attach failing receipt
const art2 = createProofArtifact({ type: 'theorem', statement: 'X implies Y' });
art2.attachReceipt({ status: 'failed' });
assert.strictEqual(art2.isVerified(), false);

// Summary
const s = art.summary();
assert.ok(s.verified === true);

console.log('OK proofArtifact');
