'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { createMessage } = require('../../src/services/morphProtocol/contract');

const actor = name => ({ agentId: name, incarnationId: `${name}:1`, trustDomain: 'morph-demo' });
const COORDINATOR = actor('coordinator');
const PARTICIPANTS = [actor('node-one'), actor('node-two')];
const WORKERS = ['a', 'b', 'c', 'd'].map(actor);
const SCOPE = { organizationId: 'morph-demo', projectId: 'transition' };
const EVIDENCE = { runtime: process.version, predicate: 'node runtime version is available', status: 'recorded' };
const SOURCE = { topology: 'syncytium', members: WORKERS.slice(0, 3),
  tasks: [{ taskId: 'task', owner: WORKERS[0], content: { state: 'open', action: 'finish verification' } }],
  obligations: [{ obligationId: 'obligation', owner: WORKERS[0], requirements: ['proof'], content: { state: 'open' } }],
  permissions: [{ grantId: 'grant', holder: WORKERS[0], resources: ['candidate'], actions: ['read'],
    conditions: { expiresAt: '2099-01-01T00:00:00Z', audience: 'mission' } }],
  budgets: [{ budgetId: 'budget', owner: WORKERS[0], unit: 'operations', limit: 10, spent: 3, reserved: 2 }],
  claims: [{ claimId: 'claim', content: { predicate: 'recorded runtime observation',
    verifierIds: ['a', 'b', 'c'], evidenceRefs: ['proof'], qualification: 'shared-context' } }],
  evidence: [{ evidenceId: 'proof', content: EVIDENCE }],
  provenance: WORKERS.map(worker => ({ agentId: worker.agentId, content: {
    origins: [worker.agentId === 'd' ? 'external-history' : 'shared-syncytium-context'],
    executionId: `execution:${worker.agentId}`, methodId: 'method-1' } })),
  dependencies: [{ dependencyId: 'shared', content: { agentIds: ['a', 'b', 'c'] } }],
  audiences: [{ messageId: 'private-message', recipients: [WORKERS[0]], contentDigest: digest('private history') }],
  uncertainties: [{ uncertaintyId: 'uncertainty', content: { unresolved: true } }],
  questions: [{ questionId: 'question', content: { text: 'Does candidate cover another environment?' } }],
  unknownEffects: [{ effectId: 'unknown', owner: WORKERS[0], content: { status: 'outcome_unknown', reference: 'external:1' } }],
};
const TARGET = structuredClone(SOURCE);
TARGET.topology = 'trinity';
TARGET.members = WORKERS;
const transfers = ['tasks', 'obligations', 'budgets', 'unknownEffects'].map(kind => {
  TARGET[kind][0].owner = WORKERS[1];
  const keys = { tasks: 'taskId', obligations: 'obligationId', budgets: 'budgetId', unknownEffects: 'effectId' };
  return { kind, id: TARGET[kind][0][keys[kind]], from: WORKERS[0], to: WORKERS[1] };
});
const PLAN = { transitionId: 'demo-transition', sourceVersion: 1, targetVersion: 2,
  participants: PARTICIPANTS, coordinator: COORDINATOR, sourceSnapshot: SOURCE, targetSnapshot: TARGET, transfers };
const QUERY = { transitionId: PLAN.transitionId, planDigest: digest(PLAN), checkpointDigest: digest(SOURCE),
  scope: SCOPE, sourceVersion: 1, targetVersion: 2, missionId: 'mission', conversationId: 'conversation' };

function prepare(directory) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'source.json'), JSON.stringify(SOURCE));
  fs.writeFileSync(path.join(directory, 'proof.json'), JSON.stringify(EVIDENCE));
}

function message(type, state, options = {}) {
  const sender = options.sender || COORDINATOR;
  const id = `${type}:${sender.agentId}`;
  const payload = type === 'PROPOSE' ? { plan: PLAN } :
    { transitionId: PLAN.transitionId, planDigest: QUERY.planDigest, ...options.payload };
  const causes = type === 'READY' ? [state.prepareMessageId] : (state ? [state.lastMessageId] : []);
  return createMessage({ messageId: id, operationId: id, missionId: QUERY.missionId,
    conversationId: QUERY.conversationId, type, sender, audience: COORDINATOR, scope: SCOPE,
    causalRefs: causes, generations: { incarnation: 1, organization: state?.committedDecision ? 2 : 1, workspace: 1 },
    authority: { authorityId: 'morph-authority', generation: 1 }, idempotencyKey: id,
    createdAt: '2026-11-02T00:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z', payload });
}

module.exports = { actor, COORDINATOR, PARTICIPANTS, WORKERS, SCOPE, SOURCE, TARGET, PLAN, QUERY, EVIDENCE, prepare, message };
