'use strict';

const { canonicalize, digest } = require('../evidenceProtocol/canonical');

function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('CONTINUITY object required.');
  const supplied = Object.keys(value);
  if (supplied.length !== keys.length || supplied.some(key => !keys.includes(key))) {
    throw new Error('CONTINUITY unexpected or missing fields.');
  }
}

function id(value) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > 512) {
    throw new Error('CONTINUITY invalid identifier.');
  }
}

function actor(value) {
  exact(value, ['agentId', 'incarnationId', 'trustDomain']);
  Object.values(value).forEach(id);
}

function generation(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('CONTINUITY invalid authority generation.');
}

function budget(value) {
  exact(value, ['unit', 'limit', 'spent', 'reserved']);
  id(value.unit);
  for (const field of ['limit', 'spent', 'reserved']) {
    if (!Number.isSafeInteger(value[field]) || value[field] < 0) throw new Error('CONTINUITY invalid budget.');
  }
  if (value.spent + value.reserved > value.limit) throw new Error('CONTINUITY budget exceeds limit.');
}

function permissions(value) {
  if (!Array.isArray(value) || value.length > 1000 || new Set(value).size !== value.length) {
    throw new Error('CONTINUITY invalid resource permissions.');
  }
  value.forEach(id);
}

function context(value) {
  exact(value.scope, ['organizationId', 'projectId']);
  Object.values(value.scope).forEach(id);
  id(value.missionId);
  id(value.branchId);
}

function resourceContext(value) {
  const copy = JSON.parse(canonicalize(value));
  exact(copy, ['scope', 'missionId', 'branchId']);
  context(copy);
  return copy;
}

function transfer(value) {
  id(value.transferId);
  if (!/^sha256:[a-f0-9]{64}$/.test(value.bundleDigest)) throw new Error('CONTINUITY invalid bundle digest.');
  actor(value.previousOwner);
  actor(value.successor);
  generation(value.previousGeneration);
  generation(value.newGeneration);
  if (value.newGeneration !== value.previousGeneration + 1) throw new Error('CONTINUITY generation must increase by one.');
  if (digest(value.previousOwner) === digest(value.successor)) throw new Error('CONTINUITY successor must change incarnation or owner.');
  permissions(value.permissions);
  budget(value.budget);
}

function execute(value) {
  id(value.operationId);
  actor(value.actor);
  generation(value.generation);
  id(value.resourceId);
  id(value.key);
  if (!Number.isSafeInteger(value.cost) || value.cost < 0) throw new Error('CONTINUITY invalid operation cost.');
  if (Buffer.byteLength(canonicalize(value.value), 'utf8') > 65536) throw new Error('CONTINUITY value exceeds byte bound.');
}

function request(action, input) {
  const value = JSON.parse(canonicalize(input));
  const common = ['scope', 'missionId', 'branchId'];
  const shapes = {
    bootstrap: ['operationId', 'owner', 'generation', 'permissions', 'budget'],
    transfer: ['transferId', 'bundleDigest', 'previousOwner', 'successor', 'previousGeneration', 'newGeneration', 'permissions', 'budget'],
    execute: ['operationId', 'actor', 'generation', 'resourceId', 'key', 'value', 'cost'],
  };
  exact(value, [...common, ...shapes[action]]);
  context(value);
  if (action === 'transfer') transfer(value);
  if (action === 'execute') execute(value);
  if (action === 'bootstrap') {
    id(value.operationId); actor(value.owner); generation(value.generation);
    permissions(value.permissions); budget(value.budget);
  }
  return value;
}

function contextKey(value) { return digest([value.scope, value.missionId, value.branchId]); }
function same(left, right) { return digest(left) === digest(right); }

function freeze(value) {
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object') freeze(child);
  }
  return Object.freeze(value);
}

module.exports = { request, resourceContext, contextKey, same, freeze };
