'use strict';

const { digest } = require('../evidenceProtocol/canonical');

const same = (left, right) => digest(left) === digest(right);
const actor = (identity) => ({ agentId: identity.agentId, incarnationId: identity.incarnationId, trustDomain: identity.trustDomain });

function immutable(value) {
  const copy = structuredClone(value);
  for (const [key, child] of Object.entries(copy)) {
    if (child && typeof child === 'object') copy[key] = immutable(child);
  }
  return Object.freeze(copy);
}

function presentation(message) {
  const { identity, predecessor, relation } = message.payload;
  if (!same(actor(identity), message.sender) || identity.missionId !== message.missionId) {
    throw new Error('CONTINUITY presented identity does not match sender or mission.');
  }
  if (same(message.sender, message.audience)) throw new Error('CONTINUITY independent recognition audience required.');
  if (identity.incarnationId === predecessor.incarnationId) throw new Error('CONTINUITY new incarnation required.');
  const sameIndividual = identity.agentId === predecessor.agentId;
  const preservesIndividual = ['continuation', 'restore'].includes(relation);
  if (sameIndividual !== preservesIndividual) throw new Error('CONTINUITY relation does not match logical identity.');
  if (relation === 'fork') return requireFork(identity, predecessor);
  if (identity.missionId !== predecessor.missionId || identity.branchId !== predecessor.branchId) {
    throw new Error('CONTINUITY mission and branch must survive this relation.');
  }
}

function requireFork(identity, predecessor) {
  if (identity.branchId === predecessor.branchId) throw new Error('CONTINUITY fork requires a new branch.');
}

function context(state, message) {
  const initial = state.presentation;
  const expected = [initial.scope, initial.missionId, initial.conversationId, initial.operationId];
  const actual = [message.scope, message.missionId, message.conversationId, message.operationId];
  if (!same(expected, actual)) throw new Error('CONTINUITY recognition context mismatch.');
  if (!same([initial.generations.organization, initial.generations.workspace],
    [message.generations.organization, message.generations.workspace])) throw new Error('CONTINUITY recognition generations changed.');
  if (!message.causalRefs.includes(state.lastMessageId)) throw new Error('CONTINUITY recognition causal reference required.');
}

function participants(state, message, returning) {
  const initial = state.presentation;
  const expectedSender = returning ? initial.audience : initial.sender;
  const expectedAudience = returning ? initial.sender : initial.audience;
  if (!same(message.sender, expectedSender) || !same(message.audience, expectedAudience)) {
    throw new Error('CONTINUITY recognition participant or audience mismatch.');
  }
  const generation = returning ? state.challengerGeneration : initial.generations.incarnation;
  if (generation !== undefined && message.generations.incarnation !== generation) {
    throw new Error('CONTINUITY recognition sender generation changed.');
  }
}

function verificationRequest(state, message) {
  return { presentation: state.presentation, challenge: state.challenge, attestation: message };
}

function boundVerification(receipt, request) {
  return receipt?.status === 'validated' && receipt.requestDigest === digest(request)
    && receipt.proofDigest === request.attestation.payload.proof.proofDigest && receipt.historyRetained === true;
}

module.exports = { same, immutable, presentation, context, participants, verificationRequest, boundVerification };
