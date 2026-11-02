'use strict';

const { createMessage } = require('../../src/services/evidenceProtocol/contract');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { EvidenceConversation } = require('../../src/services/evidenceProtocol/conversation');

const NOW = '2026-11-02T10:00:00.000Z';
const generations = { incarnation: 1, organization: 1, workspace: 1 };
let sequence = 0;

function claim(overrides = {}) {
  return { claimId: 'root', subject: { artifactDigest: digest('artifact'), baseDigest: digest('base'),
    environmentDigest: digest('environment') }, predicate: { command: 'node --version', expectedExitCode: 0 },
  assumptions: [], domain: { fingerprint: digest('domain'), description: 'test domain' }, evidence: ['evidence:1'],
  obligations: [], provenance: { producerId: 'producer', sourceRefs: [] }, dependencies: [],
  policy: { policyId: 'checked-test', version: '1' }, ...overrides };
}

function message(type, payload, overrides = {}) {
  sequence += 1;
  return createMessage({ messageId: `message:${sequence}`, operationId: 'operation:1', missionId: 'mission:1',
    conversationId: 'conversation:1', type, sender: { agentId: 'producer', incarnationId: 'incarnation:1', trustDomain: 'local' },
    scope: { organizationId: 'organization:1', projectId: 'project:1' }, causalRefs: [], generations,
    authority: { authorityId: 'authority:1', generation: 1 }, idempotencyKey: `key:${sequence}`,
    createdAt: NOW, expiresAt: '2026-11-03T10:00:00.000Z', payload, ...overrides }, { now: NOW });
}

function receipt(value) {
  return { status: 'validated', claimDigest: digest(value), subject: value.subject,
    policy: value.policy, receiptDigest: digest(['receipt', value]) };
}

function conversation(overrides = {}) {
  return new EvidenceConversation({ authorize: async () => true, acceptPolicy: async () => true,
    verifyEvidence: async ({ claim: value }) => receipt(value), clock: () => NOW, ...overrides });
}

async function accept(runtime, value) {
  let previous = message('ASSERT', { claim: value });
  await runtime.apply(previous);
  for (const type of ['REQUEST_EVIDENCE', 'VERIFY', 'ACCEPT_UNDER_POLICY']) {
    const next = message(type, { claimId: value.claimId }, { causalRefs: [previous.messageId] });
    await runtime.apply(next);
    previous = next;
  }
  return previous;
}

function promotion(value) {
  return { claimId: value.claimId, subject: value.subject, policy: value.policy, generations,
    scope: { organizationId: 'organization:1', projectId: 'project:1' },
    missionId: 'mission:1', conversationId: 'conversation:1' };
}

module.exports = { NOW, generations, claim, message, receipt, conversation, accept, promotion };
