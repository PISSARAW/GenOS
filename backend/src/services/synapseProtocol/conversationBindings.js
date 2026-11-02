'use strict';

const { canonicalize, digest } = require('../evidenceProtocol/canonical');

const copy = (value) => JSON.parse(canonicalize(value));
const same = (left, right) => digest(left) === digest(right);

function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SYNAPSE object required.');
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) throw new Error('SYNAPSE unexpected or missing fields.');
}

function id(value) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > 512) throw new Error('SYNAPSE invalid identifier.');
}

function actor(value) { exact(value, ['agentId', 'incarnationId', 'trustDomain']); Object.values(value).forEach(id); }
function generation(value) { if (!Number.isSafeInteger(value) || value < 0) throw new Error('SYNAPSE generation must be a nonnegative safe integer.'); }
function authority(value) { exact(value, ['authorityId', 'generation']); id(value.authorityId); generation(value.generation); }
function scope(value) { exact(value, ['organizationId', 'projectId']); Object.values(value).forEach(id); }

function documentQuery(input) {
  const query = copy(input);
  exact(query, ['scope', 'missionId', 'conversationId', 'contextId']);
  scope(query.scope); ['missionId', 'conversationId', 'contextId'].forEach((key) => id(query[key]));
  return query;
}

function deltaQuery(input) {
  const query = copy(input);
  exact(query, ['scope', 'missionId', 'conversationId', 'deltaId', 'deltaDigest']);
  scope(query.scope); ['missionId', 'conversationId', 'deltaId'].forEach((key) => id(query[key]));
  if (!/^sha256:[a-f0-9]{64}$/.test(query.deltaDigest)) throw new Error('SYNAPSE invalid delta digest.');
  return query;
}

function frameQuery(message, contextId) {
  return { scope: message.scope, missionId: message.missionId, conversationId: message.conversationId, contextId };
}

function messageDeltaQuery(message) {
  const delta = message.type === 'OFFER_DELTA' ? message.payload.delta : null;
  return { scope: message.scope, missionId: message.missionId, conversationId: message.conversationId,
    deltaId: delta ? delta.deltaId : message.payload.deltaId,
    deltaDigest: delta ? digest(delta) : message.payload.deltaDigest };
}

function requireFrame(dialogue, message, localActor) {
  const context = dialogue.context;
  const reverse = ['REQUEST_MISSING', 'ACK_STATE'].includes(message.type);
  const sender = reverse ? context.audience[0] : context.publisher;
  const audience = reverse ? context.publisher : context.audience[0];
  if (!same(message.sender, sender) || !same(message.audience, audience)) throw new Error('SYNAPSE sender or audience does not match the declared context.');
  if (!same(localActor, sender) && !same(localActor, audience)) throw new Error('SYNAPSE local actor is outside context audience.');
  requireEpoch(dialogue, message, reverse);
}

function requireEpoch(dialogue, message, reverse) {
  const declared = dialogue.declaration.generations;
  if (message.generations.organization !== declared.organization || message.generations.workspace !== declared.workspace) {
    throw new Error('SYNAPSE organization or workspace generation mismatch.');
  }
  if (!reverse && !same(message.authority, dialogue.declaration.authority)) throw new Error('SYNAPSE publisher authority changed.');
  if (!reverse && message.generations.incarnation !== declared.incarnation) throw new Error('SYNAPSE publisher incarnation generation changed.');
}

function requireCause(message, causes) {
  if (!causes.some((cause) => cause && message.causalRefs.includes(cause))) throw new Error('SYNAPSE causal reference required.');
}

function receipt(transfer, dialogue, message) {
  const body = { status: 'applied', ...transfer.query, contextId: dialogue.context.contextId,
    contextDigest: transfer.delta.contextDigest, baseDigest: transfer.delta.baseDigest,
    resultDigest: transfer.delta.targetDigest, previousGeneration: dialogue.context.base.generation,
    generation: dialogue.context.base.generation + 1, appliedMessageId: message.messageId, receiver: dialogue.context.audience[0] };
  generation(body.generation);
  return { ...body, receiptDigest: digest({ profile: 'genos.synapse.state-receipt/v1', ...body }) };
}

module.exports = { copy, same, exact, id, actor, generation, authority, scope, documentQuery, deltaQuery,
  frameQuery, messageDeltaQuery, requireFrame, requireCause, receipt };
