'use strict';

const assert = require('assert');
const { detectAutoimmunity } = require('../src/services/holobionte/immune/autoimmuneDetector');
const { assessImmuneOverreaction } = require('../src/services/holobionte/immune/immuneOverreactionService');

function blockedSafe(symbiontId, index, trust = 'TRUSTED') {
  return {
    symbiontId, symbiontTrust: trust, immuneDecision: 'BLOCK', verifiedOutcome: 'SAFE',
    verified: true, verifierId: 'independent-oracle', evidenceRefs: [`safe-proof:${index}`]
  };
}

function testRepeatedTrustedSafeBlocks() {
  const outcomes = [blockedSafe('safe-resident', 1), blockedSafe('safe-resident', 2), blockedSafe('safe-resident', 3)];
  const result = detectAutoimmunity({ outcomes });
  assert.strictEqual(result.suspected, true);
  assert.deepStrictEqual(result.suspects[0].evidenceRefs, ['safe-proof:1', 'safe-proof:2', 'safe-proof:3']);
  assert.strictEqual(result.trustDoesNotExemptFromReview, true);
  const review = assessImmuneOverreaction({ outcomes });
  assert.strictEqual(review.recommendedAction, 'REVIEW_IMMUNE_POLICY');
  assert.strictEqual(review.bypassAllowed, false);
  assert.strictEqual(review.automaticGateChange, false);
}

function testNoImmuneExemption() {
  const result = detectAutoimmunity({ outcomes: [
    blockedSafe('safe-resident', 1), blockedSafe('safe-resident', 2),
    { ...blockedSafe('safe-resident', 3), symbiontTrust: 'TRUSTED', verifiedOutcome: 'UNSAFE' }
  ] });
  assert.strictEqual(result.suspected, false);
  assert.throws(() => detectAutoimmunity({ outcomes: [blockedSafe('safe-resident', 1)], repeatedSafeBlocks: 1 }), {
    code: 'HOLOBIONT_AUTOIMMUNITY_INVALID'
  });
}

testRepeatedTrustedSafeBlocks();
testNoImmuneExemption();
console.log('✅ Holobiont autoimmunity tests passed.');
