'use strict';

const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { RecognitionConversation, newNonce } = require('../../src/services/continuityProtocol/recognition');
const fixture = require('./continuityContractFixture');

let sequence = 0;

function envelope(type, payload, overrides = {}) {
  sequence += 1;
  return fixture.message(type, { messageId: `recognition-${sequence}`, idempotencyKey: `recognition-key-${sequence}`, payload, ...overrides });
}

function flow(overrides = {}) {
  const present = envelope('PRESENT', fixture.payload('PRESENT'), overrides);
  const returning = { sender: present.audience, audience: present.sender,
    generations: { ...present.generations, incarnation: 1 } };
  const context = { scope: present.scope, missionId: present.missionId, conversationId: present.conversationId,
    operationId: present.operationId, generations: present.generations, sender: present.sender, audience: present.audience };
  const challenge = envelope('CHALLENGE', { presentationMessageId: present.messageId, nonce: newNonce(),
    challengeExpiresAt: '2026-11-02T10:02:00.000Z' }, { ...context, ...returning, causalRefs: [present.messageId] });
  const attest = envelope('ATTEST', { challengeMessageId: challenge.messageId, nonce: challenge.payload.nonce,
    presentationDigest: digest(present.payload), proof: { proofId: 'proof-1', proofDigest: digest('proof') } },
  { ...context, causalRefs: [challenge.messageId] });
  const proof = envelope('CONTINUITY_PROOF', { attestationMessageId: attest.messageId, proofDigest: attest.payload.proof.proofDigest },
    { ...context, ...returning, causalRefs: [attest.messageId] });
  return [present, challenge, attest, proof];
}

function receipt(request) {
  return { status: 'validated', requestDigest: digest(request),
    proofDigest: request.attestation.payload.proof.proofDigest, historyRetained: true };
}

function conversation(overrides = {}) {
  return new RecognitionConversation({ authorize: async () => true, verifyAttestation: async (request) => receipt(request),
    clock: () => fixture.NOW, ...overrides });
}

async function applyFlow(runtime, messages) {
  const results = [];
  for (const message of messages) results.push(await runtime.apply(message));
  return results;
}

module.exports = { ...fixture, envelope, flow, receipt, conversation, applyFlow };
