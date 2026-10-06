'use strict';
const crypto = require('node:crypto');

function failure(code) { return Object.assign(new Error(code), { code }); }

function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return Array.from(value, canonical);
  return canonicalObject(value);
}

function canonicalObject(value) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) throw failure('TRINITY_PROVENANCE_NON_JSON');
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
}

function encode(value) { return JSON.stringify(canonical(value)); }
function digest(value) { return hashBytes(Buffer.from(encode(value), 'utf8')); }
function hashBytes(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function clone(value) { return JSON.parse(encode(value)); }

function requireHash(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw failure('TRINITY_PROVENANCE_INVALID_HASH');
  return value;
}

function utc(value = new Date().toISOString()) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) {
    throw failure('TRINITY_PROVENANCE_INVALID_UTC');
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw failure('TRINITY_PROVENANCE_INVALID_UTC');
  return value;
}

const CORRELATION_FIELDS = ['missionId', 'experimentId', 'worldId', 'workerId', 'runId', 'parentId',
  'tenantId', 'workspaceRoot', 'snapshotId', 'snapshotHash'];

function correlation(input) {
  const result = Object.fromEntries(CORRELATION_FIELDS.map(key => [key, input[key] ?? null]));
  for (const value of Object.values(result)) {
    if (value !== null && typeof value !== 'string') throw failure('TRINITY_PROVENANCE_INVALID_CORRELATION');
  }
  if (!result.missionId || !result.runId) throw failure('TRINITY_PROVENANCE_MISSING_CORRELATION');
  if (result.snapshotHash !== null) requireHash(result.snapshotHash);
  return result;
}

function assertPublic(value) {
  if (Array.isArray(value)) return value.forEach(assertPublic);
  if (value === null || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (/^(?:authorization|password|secret|apiKey|accessToken|refreshToken|cookie|env)$/i.test(key)) {
      throw failure('TRINITY_PROVENANCE_SENSITIVE_FIELD');
    }
    assertPublic(item);
  }
}

module.exports = { canonical, encode, digest, hashBytes, clone, requireHash, utc, correlation,
  assertPublic, failure };
