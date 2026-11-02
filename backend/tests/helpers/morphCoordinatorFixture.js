'use strict';

const contract = require('./morphContractFixture');
const { MorphCoordinator } = require('../../src/services/morphProtocol/coordinator');
const bindings = require('../../src/services/morphProtocol/coordinatorBindings');
const { digest } = require('../../src/services/evidenceProtocol/canonical');
let sequence = 0;

function checkpointReceipt(request) {
  return { status: 'validated', requestDigest: digest(request), checkpointDigest: request.checkpointDigest,
    receiptDigest: digest(['checkpoint-verification', request]) };
}

function receipt(request, status) {
  const binding = { ...request.query, participant: request.participant };
  return { status, ...binding,
    receiptDigest: digest({ profile: 'genos.morph.participant/receipt/v1', status, ...binding }) };
}

function runtime(overrides = {}) {
  return new MorphCoordinator({ authorize: async () => true, clock: () => contract.NOW,
    verifyCheckpoint: async (request) => checkpointReceipt(request),
    verifyReady: async (request) => receipt(request, 'ready'),
    verifyApplied: async (request) => receipt(request, 'applied'), ...overrides });
}

function message(type = 'PROPOSE', overrides = {}) {
  sequence += 1;
  return contract.message(type, { messageId: `coordinator-message:${sequence}`,
    idempotencyKey: `coordinator-key:${sequence}`, ...overrides });
}

function next(runtimeInstance, type, overrides = {}) {
  const state = runtimeInstance.state('transition-1');
  const payload = { transitionId: state.transitionId, planDigest: state.planDigest };
  if (['REJECT', 'RECOVERY_REQUIRED'].includes(type)) payload.reason = 'Explicit operational reason';
  const organization = state.committedDecision ? state.plan.targetVersion : state.plan.sourceVersion;
  return message(type, { payload, causalRefs: [state.lastMessageId], generations: { incarnation: 1, organization, workspace: 4 }, ...overrides });
}

function ready(runtimeInstance, participant, overrides = {}) {
  const state = runtimeInstance.state('transition-1');
  const received = bindings.participantReceipt(state, participant, 'ready');
  return next(runtimeInstance, 'READY', { payload: { transitionId: state.transitionId, planDigest: state.planDigest,
    receiptDigest: received.receiptDigest }, sender: participant, causalRefs: [state.prepareMessageId], ...overrides });
}

async function prepare(runtimeInstance, stop = 'ready') {
  await runtimeInstance.apply(message());
  if (stop === 'proposed') return;
  for (const [type, status] of [['QUIESCE', 'quiescing'], ['CHECKPOINT', 'checkpointed'], ['PREPARE', 'prepared']]) {
    await runtimeInstance.apply(next(runtimeInstance, type));
    if (stop === status) return;
  }
  for (const participant of runtimeInstance.state('transition-1').plan.participants) {
    await runtimeInstance.apply(ready(runtimeInstance, participant));
  }
}

module.exports = { ...contract, checkpointReceipt, receipt, runtime, message, next, ready, prepare };
