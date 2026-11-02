'use strict';

const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { createMessage } = require('../../src/services/continuityProtocol/contract');

const NOW = '2026-11-02T10:00:00.000Z';
const actor = (identity) => ({ agentId: identity.agentId, incarnationId: identity.incarnationId, trustDomain: identity.trustDomain });

function identity(overrides = {}) {
  return { agentId: 'agent-1', incarnationId: 'incarnation-2', missionId: 'mission-1',
    branchId: 'branch-1', trustDomain: 'local', historyDigest: digest('history-current'), ...overrides };
}

function bundle(overrides = {}) {
  return { checkpoint: { checkpointId: 'checkpoint-1', digest: digest('checkpoint'), sourceHistoryDigest: digest('history-current') },
    obligations: [{ obligationId: 'obligation-1', owner: actor(identity()), evidenceRefs: ['evidence-1'] }],
    evidenceRefs: ['evidence-1'], permissions: ['resource-1'],
    budget: { unit: 'tokens', limit: 100, spent: 20, reserved: 30 },
    unknownEffects: [{ effectId: 'effect-1', owner: actor(identity()), description: 'Remote outcome unknown', reference: 'operation-1' }],
    ...overrides };
}

function payload(type) {
  const presentation = { identity: identity(), predecessor: identity({ incarnationId: 'incarnation-1' }), relation: 'continuation' };
  const values = {
    PRESENT: presentation,
    CHALLENGE: { presentationMessageId: 'message-present', nonce: 'a'.repeat(64), challengeExpiresAt: '2026-11-02T10:02:00.000Z' },
    ATTEST: { challengeMessageId: 'message-challenge', nonce: 'a'.repeat(64), presentationDigest: digest(presentation),
      proof: { proofId: 'proof-1', proofDigest: digest('proof') } },
    CONTINUITY_PROOF: { attestationMessageId: 'message-attest', proofDigest: digest('proof') },
    OFFER_HANDOFF: { transferId: 'transfer-1', source: identity({ incarnationId: 'incarnation-1' }), successor: identity(),
      bundle: bundle(), authority: { previousGeneration: 1, newGeneration: 2 } },
    SEAL_CHECKPOINT: { transferId: 'transfer-1', bundleDigest: digest(bundle()) },
    ACCEPT_RESPONSIBILITY: { transferId: 'transfer-1', bundleDigest: digest(bundle()) },
    ACTIVATE_SUCCESSOR: { transferId: 'transfer-1', bundleDigest: digest(bundle()) },
    ABORT_HANDOFF: { transferId: 'transfer-1', bundleDigest: digest(bundle()), reason: 'Cancelled before activation' },
  };
  return values[type];
}

function message(type = 'PRESENT', overrides = {}) {
  return createMessage({ messageId: `message-${type.toLowerCase()}`, operationId: 'operation-1', missionId: 'mission-1',
    conversationId: 'conversation-1', type, sender: actor(identity()),
    audience: { agentId: 'recognizer', incarnationId: 'recognizer-1', trustDomain: 'local' },
    scope: { organizationId: 'organization-1', projectId: 'project-1' }, causalRefs: [],
    generations: { incarnation: 2, organization: 1, workspace: 1 },
    authority: { authorityId: 'authority-1', generation: 1 }, idempotencyKey: `key-${type.toLowerCase()}`,
    createdAt: NOW, expiresAt: '2026-11-02T10:05:00.000Z', payload: payload(type), ...overrides }, { now: NOW });
}

module.exports = { NOW, actor, identity, bundle, payload, message };
