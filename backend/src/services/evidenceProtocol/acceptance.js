'use strict';

const { digest } = require('./canonical');
const RECEIPT = /^sha256:[a-f0-9]{64}$/;

function same(left, right) { return digest(left) === digest(right); }

function boundReceipt(receipt, claim) {
  if (receipt?.status !== 'validated' || !RECEIPT.test(receipt.receiptDigest || '')) return false;
  return receipt.claimDigest === digest(claim) && same(receipt.subject, claim.subject) && same(receipt.policy, claim.policy);
}

function assertContext(state, message) {
  const expected = [state.scope, state.conversationId, state.missionId, state.generations];
  const received = [message.scope, message.conversationId, message.missionId, message.generations];
  if (!same(expected, received)) throw new Error('EVIDENCE claim context mismatch.');
}

function eligible(store, state, seen = new Set()) {
  if (!state || state.status !== 'accepted' || seen.has(state.claim.claimId)) return false;
  seen.add(state.claim.claimId);
  for (const dependency of state.claim.dependencies) {
    const parent = store.claim(dependency);
    if (!parent || !same(parent.scope, state.scope)) return false;
    if (!eligible(store, parent, new Set(seen))) return false;
  }
  return true;
}

function canPromote(store, request) {
  const state = store.claim(request.claimId);
  if (!eligible(store, state)) return false;
  if (!request.scope || !request.missionId || !request.conversationId) return false;
  const identity = [state.scope, state.missionId, state.conversationId];
  if (!same(identity, [request.scope, request.missionId, request.conversationId])) return false;
  const expected = [state.claim.subject, state.claim.policy, state.generations];
  const current = [request.subject, request.policy, request.generations];
  return same(expected, current);
}

module.exports = { same, boundReceipt, assertContext, eligible, canPromote };
