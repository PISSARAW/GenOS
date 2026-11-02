'use strict';

const { digest } = require('../evidenceProtocol/canonical');
const { MAX_BLOB_BYTES } = require('./casSafety');

function same(left, right) { return digest(left) === digest(right); }
function query(message) {
  return { scope: message.scope, missionId: message.missionId, conversationId: message.conversationId,
    worldId: message.type === 'OFFER_WORLD' ? message.payload.world.worldId : message.payload.worldId,
    worldDigest: message.type === 'OFFER_WORLD' ? digest(message.payload.world) : message.payload.worldDigest };
}

function context(message) {
  return { scope: message.scope, missionId: message.missionId, conversationId: message.conversationId,
    sender: message.sender, audience: message.audience, generations: message.generations, authority: message.authority };
}

function requireState(state, binding) {
  if (!state || !same(state.query, binding)) throw new Error('GQWF Exchange world scope or digest mismatch.');
}

function requireMessage(state, message) {
  requireState(state, query(message));
  if (!same(state.context, context(message))) throw new Error('GQWF Exchange conversation context mismatch.');
  if (!message.causalRefs.includes(state.lastMessageId)) throw new Error('GQWF Exchange latest causal reference required.');
}

function blobs(world) {
  const unique = new Map();
  for (const file of world.manifest.files) {
    if (file.size > MAX_BLOB_BYTES) throw new Error('GQWF Exchange file exceeds transport profile byte bound.');
    const existing = unique.get(file.hash);
    if (existing && existing.size !== file.size) throw new Error('GQWF Exchange shared hash has inconsistent declared size.');
    unique.set(file.hash, { hash: file.hash, size: file.size });
  }
  return [...unique.values()].sort((left, right) => left.hash.localeCompare(right.hash));
}

function receipt(state, qualification) {
  const body = { status: 'verified', ...state.query, rootHash: state.world.rootHash,
    closureHash: state.world.closureHash, qualification };
  return { ...body, receiptDigest: digest({ profile: 'genos.gqwf.exchange/receipt/v1', ...body }) };
}

function verificationRequest(state, qualification) {
  return { query: state.query, world: state.world, qualification, objects: blobs(state.world) };
}

function verified(receipt, request) {
  return receipt?.status === 'validated' && receipt.requestDigest === digest(request)
    && /^sha256:[a-f0-9]{64}$/.test(receipt.receiptDigest || '');
}

module.exports = { same, query, context, requireState, requireMessage, blobs, receipt, verificationRequest, verified };
