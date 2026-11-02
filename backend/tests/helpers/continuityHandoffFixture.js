'use strict';

const { createMessage } = require('../../src/services/continuityProtocol/contract');
const { ContinuityHandoff } = require('../../src/services/continuityProtocol/handoff');
const { actor } = require('../../src/services/continuityProtocol/handoffBindings');
const { digest } = require('../../src/services/evidenceProtocol/canonical');

const NOW = '2026-11-02T18:00:00.000Z';
const scope = { organizationId: 'organization:1', projectId: 'project:1' };
const source = { agentId: 'agent:1', incarnationId: 'incarnation:old', trustDomain: 'local',
  missionId: 'mission:1', branchId: 'branch:1', historyDigest: digest('source-history') };
const successor = { ...source, incarnationId: 'incarnation:new', historyDigest: digest('successor-history') };
let sequence = 0;

function bundle(overrides = {}) {
  return { checkpoint: { checkpointId: 'checkpoint:1', digest: digest('checkpoint'), sourceHistoryDigest: source.historyDigest },
    obligations: [{ obligationId: 'obligation:1', owner: actor(successor), evidenceRefs: ['evidence:1'] }],
    evidenceRefs: ['evidence:1'], permissions: ['resource:1'], budget: { unit: 'tokens', limit: 100, spent: 10, reserved: 5 },
    unknownEffects: [{ effectId: 'effect:1', owner: actor(successor), description: 'Remote effect requires reconciliation.',
      reference: 'operation:unknown' }], ...overrides };
}

function offer(overrides = {}) {
  return { transferId: 'transfer:1', source, successor, bundle: bundle(),
    authority: { previousGeneration: 1, newGeneration: 2 }, ...overrides };
}

function message(type, payload, overrides = {}) {
  sequence += 1;
  const fromSuccessor = ['ACCEPT_RESPONSIBILITY', 'ACTIVATE_SUCCESSOR'].includes(type);
  return createMessage({ messageId: `handoff-message:${sequence}`, operationId: 'operation:handoff',
    missionId: source.missionId, conversationId: 'conversation:handoff', type,
    sender: actor(fromSuccessor ? successor : source), audience: actor(fromSuccessor ? source : successor),
    scope, causalRefs: [], generations: { incarnation: fromSuccessor ? 2 : 1, organization: 1, workspace: 1 },
    authority: { authorityId: 'authority:mission', generation: fromSuccessor ? 2 : 1 },
    idempotencyKey: `handoff-key:${sequence}`, createdAt: NOW, expiresAt: '2026-11-03T18:00:00.000Z',
    payload, ...overrides }, { now: NOW });
}

function checkpointReceipt(request) {
  return { status: 'validated', transferId: request.transferId, bundleDigest: request.bundleDigest,
    checkpointDigest: request.bundle.checkpoint.digest, sourceHistoryDigest: request.source.historyDigest,
    requestDigest: digest(request), receiptDigest: digest(['verified-checkpoint', request]) };
}

function activationReceipt(request) {
  return { ...request, status: 'activated',
    receiptDigest: digest({ profile: 'genos.continuity.fence/receipt/v1', status: 'activated', ...request }) };
}

function runtime(overrides = {}) {
  return new ContinuityHandoff({ authorize: async () => true, clock: () => NOW,
    verifyCheckpoint: async (request) => checkpointReceipt(request),
    activateAuthority: async (request) => activationReceipt(request), ...overrides });
}

function next(runtimeInstance, type, overrides = {}) {
  const state = runtimeInstance.state('transfer:1');
  return message(type, { transferId: state.transferId, bundleDigest: state.bundleDigest },
    { causalRefs: [state.lastMessageId], ...overrides });
}

async function prepare(runtimeInstance, status = 'accepted') {
  await runtimeInstance.apply(message('OFFER_HANDOFF', offer()));
  if (status === 'offered') return;
  await runtimeInstance.apply(next(runtimeInstance, 'SEAL_CHECKPOINT'));
  if (status === 'sealed') return;
  await runtimeInstance.apply(next(runtimeInstance, 'ACCEPT_RESPONSIBILITY'));
}

module.exports = { NOW, scope, source, successor, actor, bundle, offer, message,
  checkpointReceipt, activationReceipt, runtime, next, prepare };
