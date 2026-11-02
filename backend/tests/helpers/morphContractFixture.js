'use strict';

const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { createMessage } = require('../../src/services/morphProtocol/contract');

const NOW = '2026-11-02T10:00:00.000Z';
const actor = (agentId) => ({ agentId, incarnationId: `${agentId}-1`, trustDomain: 'local' });

function snapshot(overrides = {}) {
  const owner = actor('agent-a');
  return { topology: 'syncytium', members: [owner, actor('agent-b'), actor('agent-c')],
    tasks: [{ taskId: 'task-1', owner, content: { description: 'Verify candidate', status: 'open' } }],
    obligations: [{ obligationId: 'obligation-1', owner, requirements: ['independent-receipt'],
      content: { predicate: 'tests pass', domain: 'isolated-copy', status: 'open' } }],
    permissions: [{ grantId: 'grant-1', holder: owner, resources: ['artifact-1', 'artifact-2'], actions: ['read'],
      conditions: { projectId: 'project-1', expiresAt: '2026-11-03T10:00:00.000Z', resourceGeneration: 4 } }],
    budgets: [{ budgetId: 'budget-1', owner, unit: 'tokens', limit: 100, spent: 20, reserved: 30 }],
    claims: [{ claimId: 'claim-1', content: { subjectDigest: digest('artifact'), predicate: 'test result is zero',
      domain: 'isolated-copy', status: 'verified', limitations: ['production not checked'], evidenceRefs: ['evidence-1'] } }],
    evidence: [{ evidenceId: 'evidence-1', content: { digest: digest('receipt'), verifiedUnder: 'policy-1', environmentDigest: digest('node-env') } }],
    provenance: ['agent-a', 'agent-b', 'agent-c'].map((agentId) => ({ agentId,
      content: { originRefs: ['shared-syncytium-context'], executionSeparated: true, statisticallyIndependent: false } })),
    dependencies: [{ dependencyId: 'shared-context-1', content: { agents: ['agent-a', 'agent-b', 'agent-c'], method: 'shared-context' } }],
    audiences: [{ messageId: 'confidential-1', recipients: [owner, actor('agent-b')], contentDigest: digest('confidential') }],
    uncertainties: [{ uncertaintyId: 'uncertain-1', content: { description: 'Production applicability unknown', confidence: null } }],
    questions: [{ questionId: 'question-1', content: { description: 'Does this hold on production?', status: 'open' } }],
    unknownEffects: [{ effectId: 'effect-1', owner, content: { operationId: 'remote-1', outcome: 'unknown' } }], ...overrides };
}

function plan(overrides = {}) {
  const sourceSnapshot = snapshot();
  const targetSnapshot = structuredClone(sourceSnapshot);
  targetSnapshot.topology = 'trinity';
  targetSnapshot.members = [actor('agent-b'), actor('agent-c'), actor('agent-d')];
  const transfers = [];
  const fields = { tasks: ['taskId', 'owner'], obligations: ['obligationId', 'owner'],
    permissions: ['grantId', 'holder'], budgets: ['budgetId', 'owner'], unknownEffects: ['effectId', 'owner'] };
  for (const [kind, [idKey, ownerKey]] of Object.entries(fields)) {
    const item = targetSnapshot[kind][0];
    transfers.push({ kind, id: item[idKey], from: actor('agent-a'), to: actor('agent-d') });
    item[ownerKey] = actor('agent-d');
  }
  return { transitionId: 'transition-1', sourceVersion: 1, targetVersion: 2,
    participants: ['agent-a', 'agent-b', 'agent-c', 'agent-d'].map(actor), coordinator: actor('agent-a'),
    sourceSnapshot, targetSnapshot, transfers, ...overrides };
}

function payload(type) {
  if (type === 'PROPOSE') return { plan: plan() };
  const base = { transitionId: 'transition-1', planDigest: digest(plan()) };
  if (type === 'READY') return { ...base, receiptDigest: digest('ready-receipt') };
  if (['REJECT', 'RECOVERY_REQUIRED'].includes(type)) return { ...base, reason: 'Explicit reason' };
  return base;
}

function message(type = 'PROPOSE', overrides = {}) {
  return createMessage({ messageId: `message-${type.toLowerCase()}`, operationId: 'operation-1', missionId: 'mission-1',
    conversationId: 'conversation-1', type, sender: actor('agent-a'), audience: actor('agent-a'),
    scope: { organizationId: 'organization-1', projectId: 'project-1' }, causalRefs: [],
    generations: { incarnation: 1, organization: 1, workspace: 4 },
    authority: { authorityId: 'authority-1', generation: 3 }, idempotencyKey: `key-${type.toLowerCase()}`,
    createdAt: NOW, expiresAt: '2026-11-02T10:05:00.000Z', payload: payload(type), ...overrides }, { now: NOW });
}

module.exports = { NOW, actor, snapshot, plan, payload, message };
