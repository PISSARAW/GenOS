'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { digest } = require('../evidenceProtocol/canonical');
const { createMessage } = require('../continuityProtocol/contract');
const store = require('./continuityStore');

const budget = Object.freeze({ unit: 'authority_checks', limit: 0, spent: 0, reserved: 0 });
const resource = 'strategy_progress';
const same = (left, right) => digest(left) === digest(right);
const context = binding => ({ scope: binding.scope, missionId: binding.missionId, branchId: binding.workspaceId });

function directory(binding) {
  const destination = path.join(path.dirname(binding.directory), `continuity-${store.key(binding).slice(7)}`);
  fs.mkdirSync(destination, { recursive: true });
  return destination;
}

function identity(binding, historyDigest) {
  return { ...binding.actor, missionId: binding.missionId, branchId: binding.workspaceId, historyDigest };
}

function bundle(input) {
  const { checkpoint, snapshot, successor } = input;
  const obligations = snapshot.steps.filter(step => !['completed', 'skipped'].includes(step.status))
    .map(step => ({ obligationId: step.id, owner: successor, evidenceRefs: [checkpoint.checkpointId] }));
  return { checkpoint, obligations, evidenceRefs: [checkpoint.checkpointId], permissions: [resource], budget,
    unknownEffects: [{ effectId: snapshot.run.id, owner: successor,
      description: 'Prior run effects require native evidence or reconciliation; succession does not certify them.', reference: snapshot.run.id }] };
}

function message(binding, state, type) {
  const fromSuccessor = ['ACCEPT_RESPONSIBILITY', 'ACTIVATE_SUCCESSOR'].includes(type);
  const sender = fromSuccessor ? state.successor : state.source;
  const audience = fromSuccessor ? state.source : state.successor;
  const actor = value => ({ agentId: value.agentId, incarnationId: value.incarnationId, trustDomain: value.trustDomain });
  const id = digest([state.transferId, type]);
  return createMessage({ messageId: id, idempotencyKey: id, operationId: state.transferId,
    missionId: binding.missionId, conversationId: state.transferId, scope: binding.scope,
    sender: actor(sender), audience: actor(audience), type,
    causalRefs: state.lastMessageId ? [state.lastMessageId] : [],
    generations: state.generations, authority: binding.authority,
    createdAt: new Date(Date.parse(binding.expiresAt) - binding.executionRun.budget.latencyMs).toISOString(), expiresAt: binding.expiresAt,
    payload: type === 'OFFER_HANDOFF' ? { transferId: state.transferId, source: state.source,
      successor: state.successor, bundle: state.bundle, authority: state.authority }
      : { transferId: state.transferId, bundleDigest: state.bundleDigest } });
}

module.exports = { budget, resource, same, context, directory, identity, bundle, message };
