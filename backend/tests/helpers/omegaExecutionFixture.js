'use strict';

const { createMessage } = require('../../src/services/omegaProtocol/contract');
const { buildPlan } = require('../../src/services/omegaProtocol/admissionPlan');
const { OmegaExecution } = require('../../src/services/omegaProtocol/execution');
const { completed } = require('../../src/services/omegaProtocol/effectValidation');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const NOW = '2026-11-02T18:00:00.000Z';
const context = { scope: { organizationId: 'organization-1', projectId: 'project-1' }, missionId: 'mission-1',
  conversationId: 'conversation-1', generations: { incarnation: 1, organization: 1, workspace: 1 },
  sender: { agentId: 'client', incarnationId: 'client-1', trustDomain: 'local' },
  audience: { agentId: 'executor', incarnationId: 'executor-1', trustDomain: 'local' },
  authority: { authorityId: 'authority-1', generation: 1 }, expiresAt: '2026-11-03T18:00:00.000Z' };
let sequence = 0;

function program(overrides = {}) {
  return { schema: 'genos.gcir.omega/v1', version: 1, id: 'program-1',
    operations: [{ id: 'read', kind: 'READ', reference: 'repo', dependsOn: [], state: 'open' },
      { id: 'select', kind: 'SELECT', reference: 'slice', dependsOn: ['read'], state: 'open' },
      { id: 'check', kind: 'CHECK', reference: 'test', dependsOn: ['select'], state: 'open' },
      { id: 'emit', kind: 'EMIT', reference: 'publish', dependsOn: ['check'], state: 'open' }],
    policy: { read: ['repo'], select: ['slice'], check: ['test'], emit: ['publish'] },
    payload: { requests: { read: { objectId: 'artifact' }, select: { fields: ['answer'] },
      check: { predicate: 'answer is 42' }, emit: { resourceId: 'resource-1', action: 'publish', cost: 2 } } }, ...overrides };
}

function capabilities() {
  return { runtimeId: 'runtime-1', generation: 1, domains: ['code'],
    operations: [{ kind: 'READ', references: ['repo'] }, { kind: 'SELECT', references: ['slice'] },
      { kind: 'CHECK', references: ['test'] }, { kind: 'EMIT', references: ['publish'] }],
    verifierRefs: ['test'], effectGuarantees: ['durable_intent', 'idempotency', 'reconciliation', 'fencing'], maxOperations: 64 };
}

function accepted(overrides = {}) {
  const submission = { planId: 'plan-1', program: program(), domain: 'code', policy: { policyId: 'checked-effects', version: '1' },
    baseDigest: digest('base'), environmentDigest: digest('environment'),
    budget: { unit: 'tokens', limit: 100, spent: 10, reserved: 5 }, requirements: { verifierRefs: ['test'], effectGuarantees: [] }, ...overrides };
  const installed = capabilities();
  return { status: 'accepted', plan: buildPlan(submission, installed, context), program: submission.program,
    capabilities: installed, submission, context };
}

function message(value, type = 'EXECUTE', overrides = {}) {
  sequence += 1;
  return createMessage({ ...context, messageId: `execution-message:${sequence}`, idempotencyKey: `execution-key:${sequence}`,
    operationId: 'operation-1', type, causalRefs: [], createdAt: NOW,
    payload: { runId: 'run-1', planId: value.plan.planId, planDigest: digest(value.plan),
      baseDigest: value.plan.baseDigest, environmentDigest: value.plan.environmentDigest }, ...overrides }, { now: NOW });
}

function setup(overrides = {}) {
  const value = overrides.accepted || accepted();
  const calls = { read: 0, select: 0, check: 0, infer: 0, effect: 0 };
  const handlers = [{ kind: 'READ', reference: 'repo', pure: true, handle: async () => { calls.read += 1; return { answer: 42, irrelevant: true }; } },
    { kind: 'SELECT', reference: 'slice', pure: true, handle: async ({ input }) => { calls.select += 1; return { answer: input.answer }; } },
    { kind: 'CHECK', reference: 'test', pure: true, handle: async ({ candidate }) => {
      calls.check += 1; return { status: candidate.answer === 42 ? 'verified' : 'rejected', candidateDigest: digest(candidate) };
    } }, { kind: 'INFER', reference: 'model', handle: async () => { calls.infer += 1; return 'model-result'; } },
    { kind: 'EMIT', reference: 'publish' }];
  const receipts = new Map();
  const effectGate = { effect: async (request) => {
    if (!receipts.has(request.effectKey)) {
      calls.effect += 1;
      receipts.set(request.effectKey, completed(request, { published: request.candidate }));
    }
    return receipts.get(request.effectKey);
  } };
  const runtime = new OmegaExecution({ authorize: async () => true, resolvePlan: async () => value,
    describeRuntime: async () => value.capabilities, clock: () => NOW,
    currentContext: async () => ({ baseDigest: value.plan.baseDigest,
      environmentDigest: value.plan.environmentDigest, generations: value.context.generations }),
    handlers, effectGate, ...overrides });
  return { runtime, accepted: value, calls, handlers, effectGate, receipts };
}

module.exports = { NOW, context, program, capabilities, accepted, message, setup };
