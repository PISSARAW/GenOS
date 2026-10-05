'use strict';

const crypto = require('node:crypto');
const msgpack = require('msgpackr');
const specValidator = require('./specValidator');

const SCHEMA = 'genos.gcir.omega/v1';
const SUPPORTED_VERSIONS = Object.freeze([1]);
const READABLE_VERSIONS = Object.freeze([0, 1]);
const LEGACY_SCHEMAS = new Set(['genos.gcir.omega', 'genos.gcir.omega/v0']);
const KINDS = new Set(['READ', 'SELECT', 'CALL', 'INFER', 'CHECK', 'EMIT']);
const ERROR_CODES = Object.freeze({
  SCHEMA_UNSUPPORTED: 'omega.schema_unsupported', VERSION_UNSUPPORTED: 'omega.version_unsupported',
  ENVELOPE_INVALID: 'omega.envelope_invalid', OPERATION_INVALID: 'omega.operation_invalid',
  DUPLICATE_OPERATION: 'omega.duplicate_operation', FRAME_INVALID: 'omega.frame_invalid',
  PAYLOAD_INVALID: 'omega.payload_invalid'
});

class OmegaInteropError extends Error {
  constructor(code, message = code) { super(message); this.name = 'OmegaInteropError'; this.code = code; }
}

function error(code) { return new OmegaInteropError(code); }

function sortedObject(value) {
  if (Array.isArray(value)) return value.map(sortedObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortedObject(value[key])]));
}

function normalize(input = {}) {
  const operations = Array.isArray(input.operations) ? input.operations.map((operation) => ({
    id: String(operation.id), kind: String(operation.kind), reference: operation.reference ?? null,
    dependsOn: Array.isArray(operation.dependsOn) ? operation.dependsOn.map(String) : [],
    state: String(operation.state || 'open'),
  })) : [];
  return { schema: input.schema ?? SCHEMA, version: input.version ?? 1, id: String(input.id || 'omega-vector'), operations,
    policy: sortedObject(input.policy || {}), payload: input.payload == null ? null : sortedObject(input.payload) };
}

function validate(input) {
  const value = normalize(input);
  const schemaResult = specValidator.validateSpec('g-cir-omega.schema.json', value);
  const ids = new Set();
  const errors = [];
  if (value.schema !== SCHEMA) errors.push(ERROR_CODES.SCHEMA_UNSUPPORTED);
  if (!SUPPORTED_VERSIONS.includes(value.version)) errors.push(ERROR_CODES.VERSION_UNSUPPORTED);
  if (schemaResult.errors.length && !errors.length) errors.push(ERROR_CODES.ENVELOPE_INVALID);
  for (const operation of value.operations) {
    if (ids.has(operation.id)) errors.push(ERROR_CODES.DUPLICATE_OPERATION);
    ids.add(operation.id);
    if (!KINDS.has(operation.kind)) errors.push(ERROR_CODES.OPERATION_INVALID);
  }
  return { valid: schemaResult.available && errors.length === 0, value, errors };
}

function legacyOperation(operation = {}) {
  return { id: operation.id ?? operation.name, kind: operation.kind ?? operation.type,
    reference: operation.reference ?? operation.ref ?? null,
    dependsOn: operation.dependsOn ?? operation.dependencies ?? operation.deps ?? [],
    state: operation.state ?? operation.status ?? 'open' };
}

function migrateLegacy(input = {}) {
  if (Number(input.version) !== 0 && !LEGACY_SCHEMAS.has(input.schema)) return input;
  if (Number(input.version) === 0 && input.schema && input.schema !== SCHEMA
      && !LEGACY_SCHEMAS.has(input.schema)) throw error(ERROR_CODES.SCHEMA_UNSUPPORTED);
  const operations = input.operations || input.ops || input.graph;
  if (!Array.isArray(operations)) throw error(ERROR_CODES.ENVELOPE_INVALID);
  return { schema: SCHEMA, version: 1, id: input.id || input.runId || 'omega-legacy',
    operations: operations.map(legacyOperation), policy: input.policy || input.permissions || {},
    payload: input.payload ?? input.context ?? null };
}

function read(input) {
  const migrated = migrateLegacy(input);
  const checked = validate(migrated);
  if (!checked.valid) throw error(checked.errors[0] || ERROR_CODES.ENVELOPE_INVALID);
  return checked.value;
}

function negotiateVersion(version) {
  if (!SUPPORTED_VERSIONS.includes(Number(version))) throw error(ERROR_CODES.VERSION_UNSUPPORTED);
  return Number(version);
}

function tuple(value) {
  return [value.schema, value.version, value.id,
    value.operations.map((operation) => [operation.id, operation.kind, operation.reference,
      operation.dependsOn, operation.state]),
    Object.entries(value.policy || {}).sort(([left], [right]) => left.localeCompare(right)),
    value.payload == null ? null : JSON.stringify(value.payload)];
}

function encode(input) {
  const checked = validate(input);
  if (!checked.valid) throw error(checked.errors[0] || ERROR_CODES.ENVELOPE_INVALID);
  return msgpack.encode(tuple(checked.value));
}

function decode(buffer) {
  let frame;
  try { frame = msgpack.decode(Buffer.from(buffer)); } catch (_) { throw error(ERROR_CODES.FRAME_INVALID); }
  if (!Array.isArray(frame) || frame.length !== 6 || !Array.isArray(frame[3]) || !Array.isArray(frame[4])) {
    throw error(ERROR_CODES.FRAME_INVALID);
  }
  const [schema, version, id, operations, policyEntries, payload] = frame;
  if (!READABLE_VERSIONS.includes(Number(version))) negotiateVersion(version);
  let decodedPayload = null;
  if (payload != null) {
    try { decodedPayload = JSON.parse(payload); } catch (_) { throw error(ERROR_CODES.PAYLOAD_INVALID); }
  }
  let value;
  try {
    value = { schema, version, id, operations: operations.map(([operationId, kind, reference, dependsOn, state]) => ({
      id: operationId, kind, reference, dependsOn, state })), policy: Object.fromEntries(policyEntries),
    payload: decodedPayload };
  } catch (_) { throw error(ERROR_CODES.FRAME_INVALID); }
  return read(value);
}

function digest(input) { return `sha256:${crypto.createHash('sha256').update(encode(input)).digest('hex')}`; }

function fuzzDecode(input, seed = 17) {
  const source = Buffer.from(input);
  let state = seed >>> 0;
  let accepted = 0;
  for (let index = 0; index < 256; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const mutated = Buffer.from(source);
    mutated[state % Math.max(1, mutated.length)] ^= (state >>> 24) || 1;
    try { decode(mutated); accepted += 1; } catch (caught) {
      if (!(caught instanceof OmegaInteropError)) throw caught;
    }
  }
  return { iterations: 256, accepted };
}

function randomEnvelope(seed) {
  const id = `fuzz-${seed.toString(16)}`;
  return { schema: SCHEMA, version: 1, id,
    operations: [{ id: 'read', kind: 'READ', reference: 'fuzz', dependsOn: [], state: 'open' }],
    policy: { read: ['fuzz'] }, payload: { seed } };
}

function fuzzCampaign(options = {}) {
  const iterations = Math.max(1, Math.min(512, Number(options.iterations) || 64));
  let state = (options.seed ?? crypto.randomInt(0, 0xffffffff)) >>> 0;
  for (let index = 0; index < iterations; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const envelope = randomEnvelope(state);
    if (digest(decode(encode(envelope))) !== digest(envelope)) throw error(ERROR_CODES.ENVELOPE_INVALID);
    fuzzDecode(encode(envelope), state);
  }
  return { iterations, seed: options.seed ?? state, status: 'passed' };
}

module.exports = { SCHEMA, SUPPORTED_VERSIONS, ERROR_CODES, OmegaInteropError, normalize,
  READABLE_VERSIONS, validate, read, migrateLegacy, negotiateVersion, encode, decode, digest,
  fuzzDecode, fuzzCampaign, tuple };
