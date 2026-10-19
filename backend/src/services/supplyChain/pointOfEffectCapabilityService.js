'use strict';

const crypto = require('node:crypto');
const { canonicalValue, fingerprint } = require('../stateFingerprint');

const RECEIPT_SCHEMA = 'genos.point-of-effect-receipt/v1';
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const MAX_TTL_MS = 300000;

function refusal(code) {
  return Object.assign(new Error(code), { code });
}

function text(value, code, maximum = 512) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw refusal(code);
  return value.trim();
}

function scopeOf(value) {
  return {
    organizationId: text(value?.organizationId, 'EFFECT_ORGANIZATION_REQUIRED'),
    projectId: text(value?.projectId, 'EFFECT_PROJECT_REQUIRED'),
    environment: text(value?.environment, 'EFFECT_ENVIRONMENT_REQUIRED')
  };
}

function sameScope(left, right) {
  return left.organizationId === right.organizationId
    && left.projectId === right.projectId
    && left.environment === right.environment;
}

function digestOf(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function normalizeIssue(input, now) {
  if (!DIGEST.test(input.artifactDigest || '')) throw refusal('EFFECT_ARTIFACT_DIGEST_INVALID');
  if (!Number.isInteger(input.ttlMs) || input.ttlMs < 1 || input.ttlMs > MAX_TTL_MS) {
    throw refusal('EFFECT_CAPABILITY_TTL_INVALID');
  }
  return {
    capabilityId: `effect-capability-${crypto.randomUUID()}`,
    agentId: text(input.agentId, 'EFFECT_AGENT_REQUIRED'),
    scope: scopeOf(input.scope),
    action: text(input.action, 'EFFECT_ACTION_REQUIRED'),
    destination: text(input.destination, 'EFFECT_DESTINATION_REQUIRED', 2048),
    effectId: text(input.effectId, 'EFFECT_ADAPTER_REQUIRED'),
    secretRef: text(input.secretRef, 'EFFECT_SECRET_REFERENCE_REQUIRED'),
    artifactDigest: input.artifactDigest,
    issuedAt: now,
    expiresAt: now + input.ttlMs,
    consumed: false
  };
}

function assertBinding(record, input, now) {
  if (record.consumed) throw refusal('EFFECT_CAPABILITY_ALREADY_USED');
  if (now >= record.expiresAt) throw refusal('EFFECT_CAPABILITY_EXPIRED');
  if (record.agentId !== input.agentId) throw refusal('EFFECT_AGENT_MISMATCH');
  if (!sameScope(record.scope, scopeOf(input.scope))) throw refusal('EFFECT_SCOPE_MISMATCH');
  if (record.action !== input.action) throw refusal('EFFECT_ACTION_MISMATCH');
  if (record.destination !== input.destination) throw refusal('EFFECT_DESTINATION_MISMATCH');
  if (record.artifactDigest !== input.artifactDigest) throw refusal('EFFECT_ARTIFACT_MISMATCH');
}

function stringLeaks(value, candidates) {
  return candidates.some((candidate) => candidate && value.includes(candidate));
}

function leaksSecret(value, candidates, seen = new WeakSet()) {
  if (typeof value === 'string') return stringLeaks(value, candidates);
  if (Buffer.isBuffer(value)) return stringLeaks(value.toString('utf8'), candidates)
    || stringLeaks(value.toString('base64'), candidates);
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) throw refusal('EFFECT_RESULT_NOT_JSON');
  seen.add(value);
  const leaked = Object.values(value).some((entry) => leaksSecret(entry, candidates, seen));
  seen.delete(value);
  return leaked;
}

function publicGrant(record, token) {
  return {
    capabilityId: record.capabilityId,
    capabilityToken: token,
    agentId: record.agentId,
    scope: record.scope,
    action: record.action,
    destination: record.destination,
    artifactDigest: record.artifactDigest,
    expiresAt: new Date(record.expiresAt).toISOString(),
    singleUse: true
  };
}

async function runEffect(context) {
  const { secretResolver, adapters, record, payload } = context;
  const secret = await secretResolver({ secretRef: record.secretRef, scope: record.scope });
  if (!Buffer.isBuffer(secret) || secret.length === 0) throw refusal('EFFECT_SECRET_UNAVAILABLE');
  const candidates = [secret.toString('utf8'), secret.toString('base64')];
  try {
    const output = await adapters.get(record.effectId)({ secret, action: record.action,
      destination: record.destination, artifactDigest: record.artifactDigest,
      payload: canonicalValue(payload || {}) });
    if (leaksSecret(output, candidates)) throw refusal('EFFECT_SECRET_EXPOSURE');
    return canonicalValue(output || {});
  } finally {
    secret.fill(0);
  }
}

function executionReceipt(record, output, consumedAt) {
  const body = canonicalValue({
    schema: RECEIPT_SCHEMA,
    capabilityId: record.capabilityId,
    agentId: record.agentId,
    scope: record.scope,
    action: record.action,
    destination: record.destination,
    artifactDigest: record.artifactDigest,
    effectResultHash: fingerprint(output),
    consumedAt: new Date(consumedAt).toISOString(),
    authorizesPromotion: false
  });
  return { ...body, receiptHash: fingerprint(body) };
}

function issueCapability(context, input) {
  if (typeof context.adapters.get(input.effectId) !== 'function') throw refusal('EFFECT_ADAPTER_UNKNOWN');
  const token = crypto.randomBytes(32).toString('base64url');
  const record = normalizeIssue(input, context.now());
  context.records.set(digestOf(token), record);
  return publicGrant(record, token);
}

async function executeCapability(context, input) {
  const record = context.records.get(digestOf(text(input.capabilityToken,
    'EFFECT_CAPABILITY_TOKEN_REQUIRED', 256)));
  if (!record) throw refusal('EFFECT_CAPABILITY_UNKNOWN');
  assertBinding(record, input, context.now());
  record.consumed = true;
  const output = await runEffect({
    secretResolver: context.secretResolver,
    adapters: context.adapters,
    record,
    payload: input.payload
  });
  return { output, receipt: executionReceipt(record, output, context.now()) };
}

function create(options) {
  if (typeof options?.secretResolver !== 'function') throw refusal('EFFECT_SECRET_RESOLVER_REQUIRED');
  const context = {
    secretResolver: options.secretResolver,
    adapters: new Map(Object.entries(options.effectAdapters || {})),
    records: new Map(),
    now: typeof options.now === 'function' ? options.now : Date.now
  };
  return Object.freeze({
    issue: (input) => issueCapability(context, input),
    execute: (input) => executeCapability(context, input)
  });
}

module.exports = { RECEIPT_SCHEMA, MAX_TTL_MS, create };
