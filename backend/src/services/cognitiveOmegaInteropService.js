'use strict';

const crypto = require('node:crypto');
const msgpack = require('msgpackr');
const specValidator = require('./specValidator');

const SCHEMA = 'genos.gcir.omega/v1';
const KINDS = new Set(['READ', 'SELECT', 'CALL', 'INFER', 'CHECK', 'EMIT']);

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
  return { schema: SCHEMA, version: 1, id: String(input.id || 'omega-vector'), operations,
    policy: sortedObject(input.policy || {}), payload: input.payload == null ? null : sortedObject(input.payload) };
}

function validate(input) {
  const value = normalize(input);
  const schemaResult = specValidator.validateSpec('g-cir-omega.schema.json', value);
  const ids = new Set();
  const errors = [...schemaResult.errors];
  for (const operation of value.operations) {
    if (ids.has(operation.id)) errors.push(`duplicate operation id: ${operation.id}`);
    ids.add(operation.id);
    if (!KINDS.has(operation.kind)) errors.push(`unknown operation kind: ${operation.kind}`);
  }
  return { valid: schemaResult.available && errors.length === 0, value, errors };
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
  if (!checked.valid) throw new Error(`Invalid canonical Omega envelope: ${checked.errors.join('; ')}`);
  return msgpack.encode(tuple(checked.value));
}

function decode(buffer) {
  const frame = msgpack.decode(Buffer.from(buffer));
  if (!Array.isArray(frame) || frame.length !== 6) throw new Error('Invalid canonical Omega frame.');
  const [schema, version, id, operations, policyEntries, payload] = frame;
  const value = { schema, version, id, operations: operations.map(([operationId, kind, reference, dependsOn, state]) => ({
    id: operationId, kind, reference, dependsOn, state })), policy: Object.fromEntries(policyEntries),
    payload: payload == null ? null : JSON.parse(payload) };
  const checked = validate(value);
  if (!checked.valid) throw new Error(`Invalid decoded Omega envelope: ${checked.errors.join('; ')}`);
  return checked.value;
}

function digest(input) { return `sha256:${crypto.createHash('sha256').update(encode(input)).digest('hex')}`; }

module.exports = { SCHEMA, normalize, validate, encode, decode, digest, tuple };
