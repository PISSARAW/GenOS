'use strict';

const { digest } = require('../evidenceProtocol/canonical');

function same(left, right) { return digest(left) === digest(right); }
function context(message) {
  return { scope: message.scope, missionId: message.missionId, conversationId: message.conversationId,
    workspaceGeneration: message.generations.workspace };
}

function query(state) {
  return { transitionId: state.transitionId, planDigest: state.planDigest, checkpointDigest: state.checkpointDigest,
    scope: state.context.scope, missionId: state.context.missionId, conversationId: state.context.conversationId,
    sourceVersion: state.plan.sourceVersion, targetVersion: state.plan.targetVersion };
}

function decision(state, outcome) {
  const binding = query(state);
  return { decision: outcome, ...binding,
    decisionDigest: digest({ profile: 'genos.morph.decision/v1', decision: outcome, ...binding }) };
}

function checkpointRequest(state, stage) {
  return { stage, transitionId: state.transitionId, planDigest: state.planDigest,
    scope: state.context.scope, missionId: state.context.missionId,
    conversationId: state.context.conversationId, plan: state.plan, checkpointDigest: state.checkpointDigest };
}

function validCheckpoint(receipt, request) {
  if (receipt?.status !== 'validated' || !/^sha256:[a-f0-9]{64}$/.test(receipt.receiptDigest || '')) return false;
  return receipt.requestDigest === digest(request) && receipt.checkpointDigest === request.checkpointDigest;
}

function participantReceipt(state, participant, status) {
  const binding = { ...query(state), participant };
  return { status, ...binding,
    receiptDigest: digest({ profile: 'genos.morph.participant/receipt/v1', status, ...binding }) };
}

function requireContext(state, message) {
  if (!same(context(message), state.context) || message.payload.planDigest !== state.planDigest) {
    throw new Error('MORPH coordinator context or plan mismatch.');
  }
  if (!same(message.audience, state.plan.coordinator)) throw new Error('MORPH coordinator audience mismatch.');
  const expectedVersion = state.committedDecision ? state.plan.targetVersion : state.plan.sourceVersion;
  if (message.generations.organization !== expectedVersion) throw new Error('MORPH organization generation mismatch.');
}

function requireCoordinator(state, message) {
  if (!same(state.plan.coordinator, message.sender)) throw new Error('MORPH coordinator identity mismatch.');
  if (message.generations.incarnation !== state.coordinatorIncarnationGeneration) throw new Error('MORPH coordinator incarnation generation mismatch.');
  if (!message.causalRefs.includes(state.lastMessageId)) throw new Error('MORPH latest causal reference required.');
}

function member(state, message) {
  const participant = state.plan.participants.find((candidate) => same(candidate, message.sender));
  if (!participant) throw new Error('MORPH participant is outside fixed roster.');
  const cause = state.prepareMessageId || state.lastMessageId;
  if (!message.causalRefs.includes(cause)) throw new Error('MORPH participant causal reference required.');
  return participant;
}

module.exports = { same, context, query, decision, checkpointRequest, validCheckpoint,
  participantReceipt, requireContext, requireCoordinator, member };
