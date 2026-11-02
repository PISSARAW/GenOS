'use strict';

const { digest, canonicalize } = require('../evidenceProtocol/canonical');
const { validateContext, validateDelta } = require('./contract');

const DIMENSIONS = Object.freeze(['transport_received', 'decoded', 'state_applied', 'action_observed', 'independently_verified', 'human_authorized']);
const HASH = /^sha256:[a-f0-9]{64}$/;
const copy = value => JSON.parse(canonicalize(value));
const same = (left, right) => digest(left) === digest(right);

function exact(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('SYNAPSE ACK object required.');
  const keys = Object.keys(value);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key))) throw new Error('SYNAPSE ACK unexpected or missing fields.');
}

function id(value) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > 512) throw new Error('SYNAPSE ACK invalid identifier.');
}

function actor(value) { exact(value, ['agentId', 'incarnationId', 'trustDomain']); Object.values(value).forEach(id); }
function scope(value) { exact(value, ['organizationId', 'projectId']); Object.values(value).forEach(id); }

function query(input) {
  const value = copy(input);
  exact(value, ['scope', 'missionId', 'conversationId', 'deltaId', 'deltaDigest']);
  scope(value.scope); ['missionId', 'conversationId', 'deltaId'].forEach(key => id(value[key]));
  if (!HASH.test(value.deltaDigest)) throw new Error('SYNAPSE ACK invalid delta digest.');
  return value;
}

function messageQuery(message) {
  return { scope: message.scope, missionId: message.missionId, conversationId: message.conversationId,
    deltaId: message.payload.deltaId, deltaDigest: message.payload.deltaDigest };
}

function subject(input, binding) {
  const value = copy(input);
  exact(value, ['context', 'delta', 'receiver']);
  validateContext(value.context); validateDelta(value.delta); actor(value.receiver);
  if (value.context.audience.length !== 1 || !same(value.receiver, value.context.audience[0])) throw new Error('SYNAPSE ACK receiver does not match the declared audience.');
  if (value.delta.deltaId !== binding.deltaId || digest(value.delta) !== binding.deltaDigest ||
      value.delta.contextDigest !== digest(value.context) || value.delta.baseDigest !== value.context.base.stateDigest) {
    throw new Error('SYNAPSE ACK exact context, delta or base binding mismatch.');
  }
  return value;
}

function participants(message, value) {
  if (!same(message.sender, value.receiver) || !same(message.audience, value.context.publisher)) {
    throw new Error('SYNAPSE ACK sender or audience does not match the acknowledged subject.');
  }
  if (message.payload.subjectDigest !== digest(value)) throw new Error('SYNAPSE ACK subject digest mismatch.');
}

function frozen(value) {
  const result = copy(value);
  for (const key of Object.keys(result)) {
    if (result[key] && typeof result[key] === 'object') result[key] = frozen(result[key]);
  }
  return Object.freeze(result);
}

function verificationContext(input) {
  const value = copy(input);
  exact(value, ['environmentDigest', 'policy', 'predicateDigest']);
  exact(value.policy, ['policyId', 'version']); Object.values(value.policy).forEach(id);
  if (!HASH.test(value.environmentDigest) || !HASH.test(value.predicateDigest)) throw new Error('SYNAPSE ACK invalid verification context digest.');
  return value;
}

function commonProof(proof, request) {
  if (!proof || proof.requestDigest !== digest(request) || !HASH.test(proof.receiptDigest || '')) {
    throw new Error('SYNAPSE ACK source proof is not bound to the exact request.');
  }
}

module.exports = { DIMENSIONS, HASH, copy, same, exact, id, actor, scope, query, messageQuery,
  subject, participants, frozen, verificationContext, commonProof };
