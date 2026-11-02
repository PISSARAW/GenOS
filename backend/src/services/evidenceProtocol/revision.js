'use strict';

const { DependencyIndex } = require('../epistemicScheduler/dependencyIndex');
const { CounterexamplePropagator } = require('../epistemicScheduler/counterexamplePropagation');
const { same } = require('./acceptance');

function scopedStates(conversation, state) {
  return conversation.store.claims().filter((item) => same(item.scope, state.scope) &&
    item.conversationId === state.conversationId && item.missionId === state.missionId);
}

function graphFrom(states) {
  const graph = new DependencyIndex();
  for (const state of states) graph.addNode({ nodeId: state.claim.claimId,
    dependencies: state.claim.dependencies, domainFingerprint: state.claim.domain.fingerprint,
    status: state.status });
  return graph;
}

function applyInvalidation(states, events, message) {
  const index = new Map(states.map((state) => [state.claim.claimId, state]));
  return events.map((event) => {
    const state = index.get(event.nodeId);
    state.status = event.type === 'counterexample_validated' ? 'refuted' : event.type.replace('descendant_', '');
    state.revision += 1;
    state.lastMessageId = message.messageId;
    state.invalidation = { revisionMessageId: message.messageId, sourceClaimId: message.payload.claimId,
      receiptDigest: event.receiptDigest };
    return state;
  });
}

class EvidenceRevision {
  constructor(options) {
    if (typeof options.verifyCounterexample !== 'function') throw new Error('EVIDENCE counterexample verifier required.');
    this.conversation = options.conversation;
    this.verifyCounterexample = options.verifyCounterexample;
    const handlers = { CHALLENGE: this.challenge, COUNTEREXAMPLE: this.counterexample,
      RETRACT: this.retract, INVALIDATE_DEPENDENTS: this.invalidate, ACK_APPLIED: this.acknowledge };
    for (const [type, handler] of Object.entries(handlers)) {
      this.conversation.handlers.set(type, handler.bind(this));
    }
  }

  challenge(message, state) {
    this.requireCause(message, state);
    if (['refuted', 'retracted', 'invalidated', 'suspended', 'challenged'].includes(state.status)) {
      throw new Error('EVIDENCE CHALLENGE out of order.');
    }
    state.status = 'challenged';
    state.challengeMessageId = message.messageId;
    return this.conversation.change(message, state);
  }

  async counterexample(message, state) {
    if (state.status !== 'challenged') throw new Error('EVIDENCE COUNTEREXAMPLE requires challenge.');
    if (!message.causalRefs.includes(state.challengeMessageId)) throw new Error('EVIDENCE challenge causal reference required.');
    const states = scopedStates(this.conversation, state);
    const propagator = new CounterexamplePropagator({ graph: graphFrom(states),
      verifyCounterexample: this.verifyCounterexample });
    const result = await propagator.propagate({ targetId: state.claim.claimId,
      counterexampleResultId: message.payload.counterexampleResultId,
      domainFingerprint: message.payload.domainFingerprint });
    const changed = applyInvalidation(states, result.events, message);
    return { states: changed, result: { messageId: message.messageId, claimId: state.claim.claimId,
      status: 'refuted', receiptDigest: result.receiptDigest, affected: changed.map((item) => item.claim.claimId) } };
  }

  retract(message, state) {
    this.requireCause(message, state);
    if (message.sender.agentId !== state.claim.provenance.producerId) throw new Error('EVIDENCE only producer can retract.');
    if (state.status === 'retracted') throw new Error('EVIDENCE RETRACT already applied.');
    state.status = 'retracted';
    const states = scopedStates(this.conversation, state);
    const descendants = graphFrom(states).descendants(state.claim.claimId);
    const changed = [state, ...states.filter((item) => descendants.includes(item.claim.claimId))];
    for (const item of changed) {
      if (item !== state) item.status = 'suspended';
      item.revision += 1;
      item.lastMessageId = message.messageId;
      item.invalidation = { revisionMessageId: message.messageId, sourceClaimId: state.claim.claimId };
    }
    return { states: changed, result: { messageId: message.messageId, claimId: state.claim.claimId,
      status: 'retracted', affected: changed.map((item) => item.claim.claimId) } };
  }

  invalidate(message, state) {
    const revisionId = message.payload.revisionMessageId;
    if (!state.invalidation || state.invalidation.revisionMessageId !== revisionId) {
      throw new Error('EVIDENCE invalidation revision mismatch.');
    }
    if (!message.causalRefs.includes(revisionId)) throw new Error('EVIDENCE revision causal reference required.');
    const states = scopedStates(this.conversation, state).filter((item) =>
      item.invalidation?.revisionMessageId === revisionId);
    for (const item of states) {
      item.invalidation.appliedMessageId = message.messageId;
      item.revision += 1;
      item.lastMessageId = message.messageId;
    }
    return { states, result: { messageId: message.messageId, claimId: state.claim.claimId,
      status: state.status, revisionMessageId: revisionId, applied: states.map((item) => item.claim.claimId) } };
  }

  acknowledge(message, state) {
    const invalidation = state.invalidation;
    if (!invalidation?.appliedMessageId || invalidation.revisionMessageId !== message.payload.revisionMessageId) {
      throw new Error('EVIDENCE ACK_APPLIED requires applied invalidation.');
    }
    if (!message.causalRefs.includes(invalidation.appliedMessageId)) throw new Error('EVIDENCE applied causal reference required.');
    state.acknowledgement = { messageId: message.messageId, sender: message.sender,
      revisionMessageId: invalidation.revisionMessageId, appliedMessageId: invalidation.appliedMessageId };
    return this.conversation.change(message, state);
  }

  requireCause(message, state) {
    if (!message.causalRefs.includes(state.lastMessageId)) throw new Error('EVIDENCE latest causal reference required.');
  }
}

module.exports = { EvidenceRevision };
