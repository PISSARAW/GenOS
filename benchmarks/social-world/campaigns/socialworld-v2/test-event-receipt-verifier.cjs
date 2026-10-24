'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { canonicalPayload, verifyReceipt, applyVerifiedOutcome, shouldDelegate } = require('./event-receipt-verifier.cjs');

function signedEvent(keys, event) {
  return { ...event, signature: crypto.sign(null, Buffer.from(canonicalPayload(event)), keys.privateKey).toString('base64') };
}

function run() {
  const keys = crypto.generateKeyPairSync('ed25519');
  const trusted = new Set(['independent-verifier']);
  const seen = new Set();
  const valid = signedEvent(keys, { eventId: 'event-1', actorId: 'independent-verifier', recipientId: 'worker-a', domain: 'code', score: 1 });
  const accepted = verifyReceipt({ event: valid, publicKey: keys.publicKey, authorizedActors: trusted, seenEventIds: seen });
  assert.equal(accepted.accepted, true);
  assert.equal(verifyReceipt({ event: valid, publicKey: keys.publicKey, authorizedActors: trusted, seenEventIds: seen }).reason, 'duplicate-event');
  const forged = { ...valid, eventId: 'event-2', score: 0 };
  assert.equal(verifyReceipt({ event: forged, publicKey: keys.publicKey, authorizedActors: trusted, seenEventIds: seen }).reason, 'invalid-signature');
  const unauthorized = signedEvent(keys, { ...valid, eventId: 'event-3', actorId: 'evaluated-engine' });
  assert.equal(verifyReceipt({ event: unauthorized, publicKey: keys.publicKey, authorizedActors: trusted, seenEventIds: seen }).reason, 'unauthorized-actor');
  const trustBefore = 0.5;
  const trustAfter = applyVerifiedOutcome(trustBefore, accepted);
  assert.equal(trustAfter, 0.75);
  assert.equal(applyVerifiedOutcome(trustAfter, { accepted: false, score: 0 }), trustAfter);
  assert.equal(shouldDelegate(trustBefore, 0.7), false);
  assert.equal(shouldDelegate(trustAfter, 0.7), true);
}

run();
process.stdout.write('SocialWorld V2 event receipt verifier tests passed\n');
