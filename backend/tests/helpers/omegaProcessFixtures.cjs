'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { createMessage } = require('../../src/services/omegaProtocol/contract');
const { buildPlan } = require('../../src/services/omegaProtocol/admissionPlan');
const { effectKey } = require('../../src/services/omegaProtocol/effectValidation');

const actor = agentId => ({ agentId, incarnationId: `${agentId}:1`, trustDomain: 'omega-demo' });
const CLIENT = actor('client');
const EXECUTOR = actor('executor');
const SCOPE = { organizationId: 'omega-demo', projectId: 'execution' };
const GENERATIONS = { incarnation: 1, organization: 1, workspace: 1 };
const AUTHORITY = { authorityId: 'mission-effect', generation: 1 };
const BUDGET = { unit: 'operations', limit: 10, spent: 0, reserved: 2 };
const BASE = { revision: 'base-1', value: 7 };
const ENVIRONMENT = { node: process.version, handlerRevision: 'omega-process-demo-v1' };
const CAPS = { runtimeId: 'omega-runtime', generation: 1, domains: ['code'], maxOperations: 64,
  operations: [{ kind: 'READ', references: ['source'] }, { kind: 'SELECT', references: ['select-value'] },
    { kind: 'CHECK', references: ['is-seven'] }, { kind: 'EMIT', references: ['publish-value'] }],
  verifierRefs: ['is-seven'], effectGuarantees: ['durable_intent', 'idempotency', 'reconciliation', 'fencing'] };
const PROGRAM = { schema: 'genos.gcir.omega/v1', version: 1, id: 'omega-program',
  operations: [{ id: 'read', kind: 'READ', reference: 'source', dependsOn: [], state: 'open' },
    { id: 'select', kind: 'SELECT', reference: 'select-value', dependsOn: ['read'], state: 'open' },
    { id: 'check', kind: 'CHECK', reference: 'is-seven', dependsOn: ['select'], state: 'open' },
    { id: 'emit', kind: 'EMIT', reference: 'publish-value', dependsOn: ['check'], state: 'open' }],
  policy: { read: ['source'], select: ['select-value'], check: ['is-seven'], emit: ['publish-value'] },
  payload: { requests: { read: { objectId: 'source.json' }, select: { fields: ['value'] },
    check: { predicate: 'value-is-seven' }, emit: { resourceId: 'protected-value', action: 'set', cost: 1 } } } };
const SUBMISSION = { planId: 'omega-plan', program: PROGRAM, domain: 'code',
  policy: { policyId: 'checked-value-effects', version: '1' }, baseDigest: digest(BASE),
  environmentDigest: digest(ENVIRONMENT), budget: BUDGET,
  requirements: { verifierRefs: ['is-seven'], effectGuarantees: CAPS.effectGuarantees } };
const CONTEXT = { scope: SCOPE, missionId: 'mission', conversationId: 'omega-conversation',
  generations: GENERATIONS, sender: CLIENT, audience: EXECUTOR, authority: AUTHORITY,
  expiresAt: '2099-01-01T00:00:00.000Z' };
const PLAN = buildPlan(SUBMISSION, CAPS, CONTEXT);
const RUN_QUERY = { scope: SCOPE, missionId: CONTEXT.missionId,
  conversationId: CONTEXT.conversationId, runId: 'omega-run' };

function message(type, options = {}) {
  const conversationId = options.conversationId || CONTEXT.conversationId;
  const id = options.id || `${conversationId}:${type}`;
  let payload = { runId: RUN_QUERY.runId, planId: PLAN.planId, planDigest: digest(PLAN),
    baseDigest: PLAN.baseDigest, environmentDigest: PLAN.environmentDigest };
  if (type === 'DESCRIBE_RUNTIME') payload = { runtimeId: CAPS.runtimeId };
  if (type === 'SUBMIT_PROGRAM') payload = { submission: SUBMISSION };
  if (type === 'ACCEPT_PLAN') payload = { planId: PLAN.planId, planDigest: digest(PLAN) };
  return createMessage({ ...CONTEXT, conversationId, messageId: id, operationId: 'omega-operation', type,
    causalRefs: options.causes || [], idempotencyKey: id, createdAt: '2026-11-02T00:00:00.000Z',
    payload: options.payload || payload });
}

function prepare(directory) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'source.json'), JSON.stringify(BASE));
  fs.writeFileSync(path.join(directory, 'environment.json'), JSON.stringify(ENVIRONMENT));
  fs.writeFileSync(path.join(directory, 'counters.json'), JSON.stringify({ read: 0, select: 0, check: 0, infer: 0 }));
}

function proof(candidate) {
  const valid = digest(candidate) === digest({ value: 7 });
  return { status: valid ? 'verified' : 'rejected', valid, predicate: 'value-is-seven', candidateDigest: digest(candidate) };
}

function bootstrap() {
  return { scope: SCOPE, actor: CLIENT, authority: AUTHORITY, budget: BUDGET,
    permissions: [{ resourceId: 'protected-value', reference: 'publish-value', action: 'set', cost: 1 }] };
}

function expectedEffect() {
  const candidate = { value: 7 };
  const request = { scope: SCOPE, missionId: CONTEXT.missionId, conversationId: CONTEXT.conversationId,
    runId: RUN_QUERY.runId, planId: PLAN.planId, planDigest: digest(PLAN), programDigest: PLAN.programDigest,
    capabilitiesDigest: PLAN.capabilitiesDigest, policyDigest: PLAN.policyDigest,
    runtimeId: PLAN.runtimeId, runtimeGeneration: PLAN.runtimeGeneration, stepId: 'emit',
    kind: 'EMIT', reference: 'publish-value', baseDigest: PLAN.baseDigest, environmentDigest: PLAN.environmentDigest,
    generations: GENERATIONS, actor: CLIENT, authority: AUTHORITY, budget: BUDGET,
    resourceId: 'protected-value', action: 'set', cost: 1, candidate, candidateDigest: digest(candidate),
    proofReceipt: proof(candidate), expiresAt: CONTEXT.expiresAt };
  return { effectKey: effectKey(request), ...request };
}

module.exports = { CLIENT, EXECUTOR, SCOPE, GENERATIONS, AUTHORITY, BUDGET, BASE, ENVIRONMENT,
  CAPS, PROGRAM, SUBMISSION, CONTEXT, PLAN, RUN_QUERY, message, prepare, proof, bootstrap, expectedEffect };
