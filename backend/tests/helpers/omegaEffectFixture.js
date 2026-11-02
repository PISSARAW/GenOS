'use strict';

const { digest } = require('../../src/services/evidenceProtocol/canonical');
const { effectKey } = require('../../src/services/omegaProtocol/effectValidation');
const { EffectGate } = require('../../src/services/omegaProtocol/effects');
const { OmegaEffectResource } = require('../../src/services/omegaProtocol/resource');

const NOW = '2026-11-02T10:00:00.000Z';
const SCOPE = { organizationId: 'organization-1', projectId: 'project-1' };
const ACTOR = { agentId: 'executor', incarnationId: 'executor-1', trustDomain: 'local' };
const AUTHORITY = { authorityId: 'effect-grant', generation: 1 };
const BUDGET = { unit: 'effects', limit: 5, spent: 0, reserved: 1 };

function request(overrides = {}) {
  const candidate = { artifact: 'verified-candidate', result: 42 };
  const value = { scope: SCOPE, missionId: 'mission-1', conversationId: 'conversation-1', runId: 'run-1', planId: 'plan-1',
    planDigest: digest('plan'), programDigest: digest('program'), capabilitiesDigest: digest('capabilities'),
    policyDigest: digest('policy'), runtimeId: 'omega-runtime', runtimeGeneration: 1, stepId: 'emit-1', kind: 'EMIT',
    reference: 'verified-output', baseDigest: digest('base'), environmentDigest: digest('environment'),
    generations: { incarnation: 1, organization: 1, workspace: 1 }, actor: ACTOR, authority: AUTHORITY,
    resourceId: 'protected-output', action: 'write', cost: 1, candidate, candidateDigest: digest(candidate),
    proofReceipt: { receiptDigest: digest('proof'), candidateDigest: digest(candidate), status: 'validated' },
    budget: BUDGET, expiresAt: '2026-11-02T11:00:00.000Z', ...overrides };
  return { ...value, effectKey: effectKey(value) };
}

function proof(value) { return { status: 'validated', requestDigest: digest(value), receiptDigest: digest(['verified', value]) }; }
function bootstrap() {
  return { scope: SCOPE, actor: ACTOR, authority: AUTHORITY, budget: BUDGET,
    permissions: [{ resourceId: 'protected-output', reference: 'verified-output', action: 'write', cost: 1 }] };
}

function resource(overrides = {}) {
  return new OmegaEffectResource({ authorize: async () => true, verifyEvidence: async value => proof(value), clock: () => NOW, ...overrides });
}

function gate(endpoint, overrides = {}) {
  return new EffectGate({ authorize: async () => true, verifyEvidence: async value => proof(value),
    dispatch: value => endpoint.execute(value), reconcile: value => endpoint.reconcile(value), clock: () => NOW, ...overrides });
}

module.exports = { NOW, SCOPE, ACTOR, AUTHORITY, BUDGET, request, proof, bootstrap, resource, gate };
