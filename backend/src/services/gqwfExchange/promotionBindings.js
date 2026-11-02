'use strict';

const { digest, canonicalize } = require('../evidenceProtocol/canonical');

const copy = value => JSON.parse(canonicalize(value));
const same = (left, right) => digest(left) === digest(right);

function frozen(value) {
  const result = copy(value);
  for (const key of Object.keys(result)) {
    if (result[key] && typeof result[key] === 'object') result[key] = frozen(result[key]);
  }
  return Object.freeze(result);
}

function exact(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('GQWF Exchange object required.');
  const keys = Object.keys(value);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key))) throw new Error('GQWF Exchange unexpected fields.');
}

function id(value) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > 512) throw new Error('GQWF Exchange invalid identifier.');
}

function scope(value) { exact(value, ['organizationId', 'projectId']); Object.values(value).forEach(id); return value; }

function query(input) {
  const value = copy(input);
  exact(value, ['scope', 'missionId', 'conversationId', 'candidateId']);
  scope(value.scope);
  ['missionId', 'conversationId', 'candidateId'].forEach(key => id(value[key]));
  return value;
}

function messageQuery(message) {
  return { scope: message.scope, missionId: message.missionId, conversationId: message.conversationId,
    candidateId: message.payload.candidate?.candidateId || message.payload.candidateId };
}

function context(message) {
  return { scope: message.scope, missionId: message.missionId, conversationId: message.conversationId,
    sender: message.sender, audience: message.audience, generations: message.generations, authority: message.authority };
}

function requireContext(state, message) {
  if (!same(state.context, context(message)) || message.payload.candidateDigest !== state.candidateDigest) {
    throw new Error('GQWF Exchange candidate context or digest mismatch.');
  }
  if (!message.causalRefs.includes(state.lastMessageId)) throw new Error('GQWF Exchange previous candidate message reference required.');
}

function worldQuery(message, candidate) {
  return { scope: message.scope, missionId: message.missionId, conversationId: message.conversationId,
    worldId: candidate.worldId, worldDigest: candidate.worldDigest };
}

function validWorld(result, query) {
  if (!result?.world || !result.qualification || !result.receipt) throw new Error('GQWF Exchange verified receiver world required.');
  const body = { status: 'verified', ...query, rootHash: result.world.rootHash,
    closureHash: result.world.closureHash, qualification: result.qualification };
  const receipt = { ...body, receiptDigest: digest({ profile: 'genos.gqwf.exchange/receipt/v1', ...body }) };
  if (digest(result.world) !== query.worldDigest || !same(result.receipt, receipt)) {
    throw new Error('GQWF Exchange verified world receipt binding mismatch.');
  }
}

function requireHead(candidate, head) {
  if (candidate.baseHash !== head.rootHash || candidate.baseGeneration !== head.generation) {
    throw new Error('GQWF Exchange current base changed; new offer and evidence required.');
  }
}

function receipt(state, published) {
  const body = { status: 'committed', ...state.query, candidateDigest: state.candidateDigest,
    worldId: state.candidate.worldId, worldDigest: state.candidate.worldDigest,
    workspaceId: state.workspaceId, headName: state.candidate.headName, previousHash: state.candidate.baseHash,
    rootHash: published.rootHash, generation: published.generation,
    evidenceId: published.evidenceId, origin: state.world.origin, qualification: state.qualification,
    externalEffectsAuthorized: false };
  return { ...body, receiptDigest: digest({ profile: 'genos.gqwf.exchange/promotion-receipt/v1', ...body }) };
}

module.exports = { copy, same, frozen, exact, id, scope, query, messageQuery, context, requireContext,
  worldQuery, validWorld, requireHead, receipt };
