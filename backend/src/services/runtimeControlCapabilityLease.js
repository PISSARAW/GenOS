'use strict';

const { performance } = require('node:perf_hooks');

const PROTOCOL_VERSION = 1;
const RENEW_TYPE = 'genos-runtime-control-renew';
const DEFAULT_TTL_MS = 30000;
const LINEAGE_FIELDS = Object.freeze([
  'workerId', 'missionId', 'episodeId', 'threadId', 'organizationId', 'projectId'
]);
const RENEW_KEYS = Object.freeze(['type', 'protocolVersion', 'sequence', 'lineage']);

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function exactLineage(left, right) {
  return LINEAGE_FIELDS.every(field => typeof left?.[field] === 'string'
    && left[field] && left[field] === right?.[field]);
}

function start(now = performance.now()) {
  return Object.freeze({ sequence: 0, expiresAt: now + DEFAULT_TTL_MS });
}

function fresh(lease, now = performance.now()) {
  return Number.isSafeInteger(lease?.sequence) && lease.sequence >= 0
    && Number.isFinite(lease.expiresAt) && Number.isFinite(now) && now < lease.expiresAt;
}

function validRenewal(lease, message, lineage) {
  return exactKeys(message, RENEW_KEYS)
    && message.type === RENEW_TYPE
    && message.protocolVersion === PROTOCOL_VERSION
    && Number.isSafeInteger(message.sequence)
    && message.sequence === lease.sequence + 1
    && exactLineage(message.lineage, lineage);
}

function renew(lease, message, context) {
  const lineage = context?.lineage;
  const now = context?.now ?? performance.now();
  if (!fresh(lease, now) || !validRenewal(lease, message, lineage)) return null;
  return Object.freeze({ sequence: message.sequence, expiresAt: now + DEFAULT_TTL_MS });
}

module.exports = {
  DEFAULT_TTL_MS, PROTOCOL_VERSION, RENEW_TYPE, fresh, renew, start
};
