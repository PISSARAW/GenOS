'use strict';

const { digest } = require('../evidenceProtocol/canonical');

function same(left, right) { return digest(left) === digest(right); }
function actor(identity) {
  return { agentId: identity.agentId, incarnationId: identity.incarnationId, trustDomain: identity.trustDomain };
}

function context(message) {
  return { scope: message.scope, missionId: message.missionId, conversationId: message.conversationId,
    organizationGeneration: message.generations.organization, workspaceGeneration: message.generations.workspace };
}

function requireContext(state, message) {
  if (!same(state.context, context(message))) throw new Error('CONTINUITY handoff context mismatch.');
  if (!message.causalRefs.includes(state.lastMessageId)) throw new Error('CONTINUITY latest causal reference required.');
  if (message.payload.bundleDigest !== state.bundleDigest) throw new Error('CONTINUITY bundle digest mismatch.');
}

function requireActor(state, message, successor) {
  const sender = actor(successor ? state.successor : state.source);
  const audience = actor(successor ? state.source : state.successor);
  if (!same(message.sender, sender) || !same(message.audience, audience)) throw new Error('CONTINUITY handoff actor or audience mismatch.');
}

function requireOffer(message) {
  const payload = message.payload;
  const { source, successor, bundle, authority } = payload;
  if (source.incarnationId === successor.incarnationId) throw new Error('CONTINUITY distinct successor incarnation required.');
  if (source.missionId !== message.missionId || successor.missionId !== message.missionId) throw new Error('CONTINUITY mission mismatch.');
  if (source.branchId !== successor.branchId) throw new Error('CONTINUITY cross-branch handoff requires separate authorization profile.');
  if (!Number.isSafeInteger(authority.newGeneration) || authority.newGeneration !== authority.previousGeneration + 1) {
    throw new Error('CONTINUITY authority generation must advance exactly once.');
  }
  if (bundle.checkpoint.sourceHistoryDigest !== source.historyDigest) throw new Error('CONTINUITY checkpoint history mismatch.');
  for (const item of [...bundle.obligations, ...bundle.unknownEffects]) {
    if (!same(item.owner, actor(successor))) throw new Error('CONTINUITY successor responsibility assignment required.');
  }
  requireActor(payload, message, false);
}

function checkpointRequest(state) {
  return { transferId: state.transferId, bundleDigest: state.bundleDigest,
    source: state.source, successor: state.successor, bundle: state.bundle,
    scope: state.context.scope, missionId: state.context.missionId, branchId: state.source.branchId };
}

function validCheckpoint(receipt, state) {
  if (receipt?.status !== 'validated' || !/^sha256:[a-f0-9]{64}$/.test(receipt.receiptDigest || '')) return false;
  if (receipt.requestDigest !== digest(checkpointRequest(state))) return false;
  const expected = [state.transferId, state.bundleDigest, state.bundle.checkpoint.digest, state.source.historyDigest];
  return same(expected, [receipt.transferId, receipt.bundleDigest, receipt.checkpointDigest, receipt.sourceHistoryDigest]);
}

function activationRequest(state) {
  return { transferId: state.transferId, bundleDigest: state.bundleDigest,
    scope: state.context.scope, missionId: state.context.missionId, branchId: state.source.branchId,
    previousOwner: actor(state.source), successor: actor(state.successor),
    previousGeneration: state.authority.previousGeneration, newGeneration: state.authority.newGeneration,
    permissions: state.bundle.permissions, budget: state.bundle.budget };
}

function validActivation(receipt, request) {
  const body = { profile: 'genos.continuity.fence/receipt/v1', status: 'activated', ...request };
  return same(receipt, { ...request, status: 'activated', receiptDigest: digest(body) });
}

module.exports = { same, actor, context, requireContext, requireActor, requireOffer,
  checkpointRequest, validCheckpoint, activationRequest, validActivation };
