'use strict';

const { digest } = require('../../src/services/evidenceProtocol/canonical');
const interop = require('../../src/services/cognitiveOmegaInteropService');
const { createMessage } = require('../../src/services/omegaProtocol/contract');

const NOW = '2026-11-02T10:00:00.000Z';
const actor = (agentId) => ({ agentId, incarnationId: `${agentId}-1`, trustDomain: 'local' });
const budget = () => ({ unit: 'tokens', limit: 100, spent: 10, reserved: 20 });

function program(overrides = {}) {
  return { schema: interop.SCHEMA, version: 1, id: 'program-1', operations: [
    { id: 'read', kind: 'READ', reference: 'store/read', dependsOn: [], state: 'open' },
    { id: 'select', kind: 'SELECT', reference: 'candidate/select', dependsOn: ['read'], state: 'open' },
    { id: 'check', kind: 'CHECK', reference: 'candidate/check', dependsOn: ['select'], state: 'open' },
    { id: 'emit', kind: 'EMIT', reference: 'resource/emit', dependsOn: ['check'], state: 'open' },
  ], policy: { read: ['store/read'], select: ['candidate/select'], check: ['candidate/check'], emit: ['resource/emit'] },
  payload: { requests: { read: { objectId: 'candidate' }, select: { fields: ['value'] },
    check: { predicate: 'is-pass' }, emit: { resourceId: 'resource-1', action: 'write', cost: 5 } } }, ...overrides };
}

function capabilities(overrides = {}) {
  return { runtimeId: 'runtime-1', generation: 1, domains: ['omega-demo'],
    operations: program().operations.map(({ kind, reference }) => ({ kind, references: [reference] })),
    verifierRefs: ['candidate/check'], effectGuarantees: ['durable_intent', 'idempotency', 'reconciliation', 'fencing'],
    maxOperations: 64, ...overrides };
}

function submission(overrides = {}) {
  return { planId: 'plan-1', program: program(), domain: 'omega-demo', policy: { policyId: 'policy-1', version: '1' },
    baseDigest: digest('base'), environmentDigest: digest('node-env'),
    requirements: { verifierRefs: ['candidate/check'], effectGuarantees: ['idempotency'] }, budget: budget(), ...overrides };
}

function effect(overrides = {}) {
  const context = { scope: { organizationId: 'organization-1', projectId: 'project-1' }, missionId: 'mission-1',
    conversationId: 'conversation-1', runId: 'run-1', planDigest: digest('plan'), stepId: 'emit' };
  return { ...context, effectKey: digest(context), planId: 'plan-1', programDigest: interop.digest(program()),
    capabilitiesDigest: digest(capabilities()), policyDigest: digest(submission().policy), runtimeId: 'runtime-1', runtimeGeneration: 1,
    kind: 'EMIT', reference: 'resource/emit', baseDigest: digest('base'), environmentDigest: digest('node-env'),
    generations: { incarnation: 1, organization: 1, workspace: 1 }, actor: actor('caller'),
    authority: { authorityId: 'authority-1', generation: 1 }, resourceId: 'resource-1', action: 'write', cost: 5,
    candidate: { value: 'pass' }, candidateDigest: digest({ value: 'pass' }), proofReceipt: { status: 'verified' },
    budget: budget(), expiresAt: '2026-11-02T10:05:00.000Z', ...overrides };
}

function payload(type) {
  if (type === 'DESCRIBE_RUNTIME') return { runtimeId: 'runtime-1' };
  if (type === 'SUBMIT_PROGRAM') return { submission: submission() };
  if (type === 'ACCEPT_PLAN') return { planId: 'plan-1', planDigest: digest('plan') };
  if (['EXECUTE', 'RESUME', 'REPORT_OBLIGATIONS'].includes(type)) return { runId: 'run-1', planId: 'plan-1',
    planDigest: digest('plan'), baseDigest: digest('base'), environmentDigest: digest('node-env') };
  if (type === 'REQUEST_EFFECT') return { effect: effect() };
  if (type === 'EFFECT_RECEIPT') return { effectKey: effect().effectKey, receiptDigest: digest('effect-receipt') };
  if (type === 'EFFECT_OUTCOME_UNKNOWN') return { effectKey: effect().effectKey, reason: 'Receiver outcome unavailable' };
  return { effectKey: effect().effectKey };
}

function message(type = 'DESCRIBE_RUNTIME', overrides = {}) {
  return createMessage({ messageId: `message-${type.toLowerCase()}`, operationId: 'operation-1', missionId: 'mission-1',
    conversationId: 'conversation-1', type, sender: actor('caller'), audience: actor('runtime'),
    scope: { organizationId: 'organization-1', projectId: 'project-1' }, causalRefs: [],
    generations: { incarnation: 1, organization: 1, workspace: 1 }, authority: { authorityId: 'authority-1', generation: 1 },
    idempotencyKey: `key-${type.toLowerCase()}`, createdAt: NOW, expiresAt: '2026-11-02T10:05:00.000Z',
    payload: payload(type), ...overrides }, { now: NOW });
}

module.exports = { NOW, actor, budget, program, capabilities, submission, effect, payload, message };
