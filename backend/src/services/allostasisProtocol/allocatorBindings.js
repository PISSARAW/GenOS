'use strict';

const { canonicalize, digest } = require('../evidenceProtocol/canonical');
const { UNITS } = require('./contract');

const copy = (value) => JSON.parse(canonicalize(value));
const same = (left, right) => digest(left) === digest(right);

function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ALLOSTASIS object required.');
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) throw new Error('ALLOSTASIS unexpected or missing fields.');
}

function id(value) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > 512) throw new Error('ALLOSTASIS invalid identifier.');
}

function amount(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('ALLOSTASIS exact nonnegative safe integer required.');
  return value;
}

function actor(value) { exact(value, ['agentId', 'incarnationId', 'trustDomain']); Object.values(value).forEach(id); }
function authority(value) { exact(value, ['authorityId', 'generation']); id(value.authorityId); amount(value.generation); }
function scope(value) { exact(value, ['organizationId', 'projectId']); Object.values(value).forEach(id); }

function poolQuery(input) {
  const query = copy(input);
  exact(query, ['scope', 'missionId', 'budgetId', 'unit']);
  scope(query.scope); id(query.missionId); id(query.budgetId);
  if (!UNITS.includes(query.unit)) throw new Error('ALLOSTASIS unsupported exact unit.');
  return query;
}

function allocationQuery(input) {
  const query = copy(input);
  exact(query, ['scope', 'missionId', 'conversationId', 'allocationId', 'allocationDigest']);
  scope(query.scope); ['missionId', 'conversationId', 'allocationId'].forEach((key) => id(query[key]));
  if (!/^sha256:[a-f0-9]{64}$/.test(query.allocationDigest)) throw new Error('ALLOSTASIS invalid allocation digest.');
  return query;
}

function messagePool(message) {
  return { scope: message.scope, missionId: message.missionId, budgetId: message.payload.budgetId, unit: message.payload.unit };
}

function configuration(input) {
  exact(input, ['capacity', 'protectedReserve', 'consumed']);
  Object.values(input).forEach(amount);
  if (input.protectedReserve > input.capacity || input.consumed > input.capacity - input.protectedReserve) {
    throw new Error('ALLOSTASIS pool cannot cover its protected reserve and consumed baseline.');
  }
}

function available(pool) { return Math.max(0, pool.capacity - pool.protectedReserve - pool.consumed - pool.held); }

function proof(value, request) {
  if (value?.status !== 'validated' || value.requestDigest !== digest(request) || !/^sha256:[a-f0-9]{64}$/.test(value.receiptDigest || '')) {
    throw new Error('ALLOSTASIS budget admission proof does not bind the exact request and forecast.');
  }
}

module.exports = { copy, same, exact, id, amount, actor, authority, scope, poolQuery, allocationQuery,
  messagePool, configuration, available, proof };
