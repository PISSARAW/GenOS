'use strict';

const { canonicalize, digest } = require('../evidenceProtocol/canonical');

const HASH = /^sha256:[a-f0-9]{64}$/;
const FIELDS = ['effectKey', 'scope', 'missionId', 'conversationId', 'runId', 'planId', 'planDigest',
  'programDigest', 'capabilitiesDigest', 'policyDigest', 'runtimeId', 'runtimeGeneration', 'stepId',
  'kind', 'reference', 'baseDigest', 'environmentDigest', 'generations', 'actor', 'authority',
  'resourceId', 'action', 'cost', 'candidate', 'candidateDigest', 'proofReceipt', 'budget', 'expiresAt'];

function copy(value) { return JSON.parse(canonicalize(value)); }
function same(left, right) { return digest(left) === digest(right); }

function exact(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('OMEGA object required.');
  const keys = Object.keys(value);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key))) throw new Error('OMEGA unexpected or missing fields.');
}

function id(value) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > 512) throw new Error('OMEGA invalid identifier.');
}

function integer(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('OMEGA nonnegative safe integer required.');
}

function scope(value) { exact(value, ['organizationId', 'projectId']); Object.values(value).forEach(id); return value; }
function actor(value) { exact(value, ['agentId', 'incarnationId', 'trustDomain']); Object.values(value).forEach(id); }
function authority(value) { exact(value, ['authorityId', 'generation']); id(value.authorityId); integer(value.generation); }

function budget(value) {
  exact(value, ['unit', 'limit', 'spent', 'reserved']); id(value.unit);
  ['limit', 'spent', 'reserved'].forEach(key => integer(value[key]));
  if (value.spent > value.limit - value.reserved) throw new Error('OMEGA invalid budget allocation.');
}

function freshness(request, now) {
  const current = typeof now === 'number' ? now : Date.parse(now);
  const expires = Date.parse(request.expiresAt);
  if (!Number.isFinite(current) || !Number.isFinite(expires)) throw new Error('OMEGA invalid effect clock or expiration.');
  if (expires <= current) throw new Error('OMEGA effect authorization expired.');
}

function effectKey(value) {
  return digest({ scope: value.scope, missionId: value.missionId, conversationId: value.conversationId,
    runId: value.runId, planDigest: value.planDigest, stepId: value.stepId });
}

function request(input) {
  const value = copy(input);
  exact(value, FIELDS);
  scope(value.scope); actor(value.actor); authority(value.authority); budget(value.budget);
  ['missionId', 'conversationId', 'runId', 'planId', 'runtimeId', 'stepId', 'reference', 'resourceId', 'action'].forEach(key => id(value[key]));
  ['planDigest', 'programDigest', 'capabilitiesDigest', 'policyDigest', 'baseDigest', 'environmentDigest', 'candidateDigest'].forEach(key => {
    if (!HASH.test(value[key])) throw new Error('OMEGA invalid effect binding digest.');
  });
  exact(value.generations, ['incarnation', 'organization', 'workspace']);
  Object.values(value.generations).forEach(integer);
  integer(value.runtimeGeneration); integer(value.cost);
  if (!['CALL', 'EMIT'].includes(value.kind)) throw new Error('OMEGA invalid effect kind.');
  if (value.candidateDigest !== digest(value.candidate) || value.effectKey !== effectKey(value)) throw new Error('OMEGA effect candidate or key mismatch.');
  if (value.proofReceipt !== null && (typeof value.proofReceipt !== 'object' || Array.isArray(value.proofReceipt))) throw new Error('OMEGA proof receipt must be an object or null.');
  if (!Number.isFinite(Date.parse(value.expiresAt))) throw new Error('OMEGA invalid effect expiration.');
  if (Buffer.byteLength(canonicalize(value.candidate), 'utf8') > 65536) throw new Error('OMEGA effect candidate exceeds byte bound.');
  return value;
}

function query(input) {
  const value = copy(input); exact(value, ['effectKey']);
  if (!HASH.test(value.effectKey)) throw new Error('OMEGA invalid effect key.');
  return value;
}

function frozen(value) {
  const result = copy(value);
  for (const key of Object.keys(result)) {
    if (result[key] && typeof result[key] === 'object') result[key] = frozen(result[key]);
  }
  return Object.freeze(result);
}

function verified(value, request) {
  return value?.status === 'validated' && value.requestDigest === digest(request) && HASH.test(value.receiptDigest || '');
}

function completed(request, result) {
  const body = { status: 'completed', effectKey: request.effectKey, requestDigest: digest(request), result };
  return { ...body, receiptDigest: digest({ profile: 'genos.omega.effect-receipt/v1', ...body }) };
}

function validReceipt(value, request) {
  if (value?.status !== 'completed' || !Object.hasOwn(value, 'result')) return false;
  try { return same(value, completed(request, value.result)); }
  catch { return false; }
}

function notApplied(request) {
  const body = { status: 'not_applied', effectKey: request.effectKey, requestDigest: digest(request), retrySafe: true };
  return { ...body, receiptDigest: digest({ profile: 'genos.omega.effect-reconciliation/v1', ...body }) };
}

function validNotApplied(value, request) {
  try { return same(value, notApplied(request)); }
  catch { return false; }
}

module.exports = { copy, same, exact, id, integer, scope, actor, authority, budget, freshness, effectKey,
  request, query, frozen, verified, completed, validReceipt, notApplied, validNotApplied };
