'use strict';

const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { createMessage } = require('../../src/services/evidenceProtocol/contract');

const NOW = '2026-11-02T10:00:00.000Z';

function claim(overrides = {}) {
  return {
    claimId: 'claim-1',
    subject: { artifactDigest: digest('candidate'), baseDigest: digest('base'), environmentDigest: digest('node-fixture') },
    predicate: { command: 'node --version', expectedExitCode: 0 },
    assumptions: ['node is installed'],
    domain: { fingerprint: digest('domain'), description: 'Fixture process environment' },
    evidence: ['execution-result-1'], obligations: ['check-node'],
    provenance: { producerId: 'producer', sourceRefs: ['source-1'] },
    dependencies: [], policy: { policyId: 'fixture-policy', version: '1' },
    ...overrides,
  };
}

function message(overrides = {}) {
  return createMessage({
    messageId: 'message-1', operationId: 'operation-1', missionId: 'mission-1',
    conversationId: 'conversation-1', type: 'ASSERT',
    sender: { agentId: 'producer', incarnationId: 'producer-1', trustDomain: 'fixture' },
    scope: { organizationId: 'organization-1', projectId: 'project-1' },
    causalRefs: [], generations: { incarnation: 1, organization: 2, workspace: 3 },
    authority: { authorityId: 'authority-1', generation: 1 },
    idempotencyKey: 'idempotency-1', createdAt: NOW, expiresAt: '2026-11-03T10:00:00.000Z',
    payload: { claim: claim() }, ...overrides,
  }, { now: NOW });
}

module.exports = { NOW, claim, message };
