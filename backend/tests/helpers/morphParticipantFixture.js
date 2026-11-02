'use strict';

const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { MorphParticipant } = require('../../src/services/morphProtocol/participant');
const base = require('./morphContractFixture');

const scope = { organizationId: 'organization-1', projectId: 'project-1' };
const participant = base.actor('agent-b');

function plan() {
  const result = base.plan();
  for (const snapshot of [result.sourceSnapshot, result.targetSnapshot]) {
    snapshot.claims[0].content.verifierIds = ['agent-b', 'agent-c'];
    snapshot.provenance = ['agent-a', 'agent-b', 'agent-c'].map(agentId => ({ agentId,
      content: { origins: ['shared-syncytium-context'], executionId: `execution:${agentId}`, methodId: 'shared-method' } }));
    snapshot.dependencies = [{ dependencyId: 'shared-context', content: { agentIds: ['agent-a', 'agent-b', 'agent-c'] } }];
  }
  return result;
}

function query(value = plan()) {
  return { transitionId: value.transitionId, planDigest: digest(value), checkpointDigest: digest(value.sourceSnapshot),
    scope, sourceVersion: value.sourceVersion, targetVersion: value.targetVersion,
    missionId: 'mission-1', conversationId: 'conversation-1' };
}

function request(value = plan()) { return { ...query(value), plan: value }; }
function checkpoint(value) { return { status: 'validated', requestDigest: digest(value), receiptDigest: digest(['checkpoint', value]) }; }

function decision(value, choice = 'COMMIT') {
  const body = { decision: choice, ...value };
  return { ...body, decisionDigest: digest({ profile: 'genos.morph.decision/v1', ...body }) };
}

function runtime(options = {}) {
  return new MorphParticipant({ participantId: participant, authorize: async () => true,
    verifyCheckpoint: async value => checkpoint(value), verifyDecision: async value => decision(value), ...options });
}

function action(overrides = {}) {
  return { scope, actor: base.actor('agent-b'), version: 1, operationId: 'operation-1', content: { useful: true }, ...overrides };
}

function verification(overrides = {}) {
  return { scope, claimId: 'claim-1', verifierIds: ['agent-b', 'agent-c'], minimumIndependentGroups: 2, ...overrides };
}

module.exports = { scope, participant, actor: base.actor, plan, query, request, checkpoint, decision, runtime, action, verification };
