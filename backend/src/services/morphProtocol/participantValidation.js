'use strict';

const { canonicalize, digest } = require('../evidenceProtocol/canonical');
const { validatePlan, validateSnapshot } = require('./contract');

const FIELDS = ['transitionId', 'planDigest', 'checkpointDigest', 'scope', 'sourceVersion',
  'targetVersion', 'missionId', 'conversationId'];
const HASH = /^sha256:[a-f0-9]{64}$/;

function exact(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('MORPH object required.');
  const keys = Object.keys(value);
  if (keys.length !== fields.length || keys.some(key => !fields.includes(key))) {
    throw new Error('MORPH unexpected or missing fields.');
  }
}

function id(value) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > 512) throw new Error('MORPH invalid identifier.');
}

function actor(value) {
  exact(value, ['agentId', 'incarnationId', 'trustDomain']);
  Object.values(value).forEach(id);
  return value;
}

function scope(value) {
  exact(value, ['organizationId', 'projectId']);
  Object.values(value).forEach(id);
  return value;
}

function copy(value) { return JSON.parse(canonicalize(value)); }
function same(left, right) { return digest(left) === digest(right); }

function query(input) {
  const value = copy(input);
  exact(value, FIELDS);
  ['transitionId', 'missionId', 'conversationId'].forEach(key => id(value[key]));
  scope(value.scope);
  if (!HASH.test(value.planDigest) || !HASH.test(value.checkpointDigest)) throw new Error('MORPH invalid digest.');
  if (!Number.isSafeInteger(value.sourceVersion) || value.sourceVersion < 0 ||
      !Number.isSafeInteger(value.targetVersion) || value.targetVersion !== value.sourceVersion + 1) {
    throw new Error('MORPH invalid organization version.');
  }
  return value;
}

function prepared(input) {
  const value = copy(input);
  exact(value, [...FIELDS, 'plan']);
  const { plan, ...binding } = value;
  const bound = query(binding);
  validatePlan(plan);
  const expected = [plan.transitionId, digest(plan), digest(plan.sourceSnapshot), plan.sourceVersion, plan.targetVersion];
  const actual = [bound.transitionId, bound.planDigest, bound.checkpointDigest, bound.sourceVersion, bound.targetVersion];
  if (!same(expected, actual)) throw new Error('MORPH plan binding mismatch.');
  return { query: bound, plan };
}

function bootstrap(context, snapshot) {
  const value = copy(context);
  exact(value, ['scope', 'version']);
  scope(value.scope);
  if (!Number.isSafeInteger(value.version) || value.version < 0) throw new Error('MORPH invalid organization version.');
  return { ...value, snapshot: validateSnapshot(snapshot), phase: 'active', transition: null };
}

function frozen(value) {
  const result = copy(value);
  for (const key of Object.keys(result)) {
    if (result[key] && typeof result[key] === 'object') result[key] = frozen(result[key]);
  }
  return Object.freeze(result);
}

function receipt(status, binding, participant) {
  const body = { status, ...binding, participant };
  return { ...body, receiptDigest: digest({ profile: 'genos.morph.participant/receipt/v1', ...body }) };
}

function validDecision(value, binding) {
  if (!['COMMIT', 'ABORT'].includes(value?.decision)) throw new Error('MORPH decision unknown; recovery required.');
  const body = { decision: value.decision, ...binding };
  if (!same(value, { ...body, decisionDigest: digest({ profile: 'genos.morph.decision/v1', ...body }) })) {
    throw new Error('MORPH decision binding mismatch; recovery required.');
  }
  return value.decision;
}

module.exports = { exact, id, actor, scope, copy, same, query, prepared, bootstrap, frozen, receipt, validDecision };
