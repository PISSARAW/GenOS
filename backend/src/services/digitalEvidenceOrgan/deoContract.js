'use strict';

const crypto = require('node:crypto');
const { pack, unpack } = require('msgpackr');
const { canonicalValue } = require('../stateFingerprint');

const DEO_SCHEMA = 'genos.digital-evidence-organ/v1';
const DEO_OBSERVATION_SCHEMA = 'genos.deo-observation/v1';
const DEO_DOSSIER_SCHEMA = 'genos.deo-dossier/v1';
const DEO_BINARY_MAGIC = Buffer.from('GDEO', 'ascii');
const SHA256_REGEX = /^sha256:[a-f0-9]{64}$/;

const SUPPORTED_FORMATS = Object.freeze([
  'evtx',
  'nmap_xml',
  'hayabusa_csv',
  'gpo_report',
  'conftest',
]);

const RETENTION_TIERS = Object.freeze([
  'ephemeral',
  'short_term',
  'standard',
  'forensic_hold',
]);

function deoError(code, message, details = {}) {
  return Object.assign(new Error(message || code), { code, details });
}

function sha256Hex(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function sha256Digest(input) {
  return `sha256:${sha256Hex(input)}`;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function canonicalDigest(value) {
  return sha256Digest(canonicalJson(value));
}

function isValidSha256Digest(value) {
  return typeof value === 'string' && SHA256_REGEX.test(value.trim());
}

function parseIsoTimestamp(value, code = 'DEO_TIMESTAMP_INVALID') {
  if (typeof value !== 'string' || !value.trim()) {
    throw deoError(code, 'Timestamp must be a non-empty ISO-8601 string.');
  }
  const ms = Date.parse(value.trim());
  if (!Number.isFinite(ms)) {
    throw deoError(code, `Invalid timestamp '${value}'.`);
  }
  return { iso: new Date(ms).toISOString(), epochMs: ms };
}

function requireNonEmptyText(value, code, maxLen = 2048) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLen) {
    throw deoError(code, `Invalid or missing text field (${code}).`);
  }
  return value.trim();
}

function freezeRawBytes(rawContent) {
  if (Buffer.isBuffer(rawContent)) {
    return Buffer.from(rawContent);
  }
  if (rawContent instanceof Uint8Array) {
    return Buffer.from(rawContent);
  }
  if (typeof rawContent === 'string') {
    return Buffer.from(rawContent, 'utf8');
  }
  throw deoError('DEO_RAW_ARTIFACT_REQUIRED', 'Raw artifact content must be a Buffer, Uint8Array, or string.');
}

function encodeTypedBinary(payload) {
  const canonical = canonicalValue(payload);
  const packed = pack(canonical);
  const digest = Buffer.from(sha256Hex(packed), 'hex');
  return Buffer.concat([DEO_BINARY_MAGIC, Buffer.from([1]), digest, packed]);
}

function decodeTypedBinary(frame) {
  if (!Buffer.isBuffer(frame) && !(frame instanceof Uint8Array)) {
    throw deoError('DEO_BINARY_FRAME_INVALID', 'Binary DEO frame must be a Buffer or Uint8Array.');
  }
  const buf = Buffer.from(frame);
  if (buf.length < 37 || !buf.subarray(0, 4).equals(DEO_BINARY_MAGIC)) {
    throw deoError('DEO_BINARY_MAGIC_MISMATCH', 'Invalid GDEO binary magic header.');
  }
  if (buf[4] !== 1) {
    throw deoError('DEO_BINARY_VERSION_UNSUPPORTED', `Unsupported GDEO wire version: ${buf[4]}.`);
  }
  const expectedDigest = buf.subarray(5, 37).toString('hex');
  const packed = buf.subarray(37);
  if (sha256Hex(packed) !== expectedDigest) {
    throw deoError('DEO_BINARY_DIGEST_MISMATCH', 'Binary frame digest mismatch (corrupted or tampered frame).');
  }
  return unpack(packed);
}

module.exports = {
  DEO_SCHEMA,
  DEO_OBSERVATION_SCHEMA,
  DEO_DOSSIER_SCHEMA,
  DEO_BINARY_MAGIC,
  SUPPORTED_FORMATS,
  RETENTION_TIERS,
  deoError,
  sha256Hex,
  sha256Digest,
  canonicalJson,
  canonicalDigest,
  isValidSha256Digest,
  parseIsoTimestamp,
  requireNonEmptyText,
  freezeRawBytes,
  encodeTypedBinary,
  decodeTypedBinary,
};
