'use strict';

const crypto = require('node:crypto');
const reconnectProtocol = require('./runtimeControlReconnectProtocol');

const TYPE = 'genos-runtime-supervision-event';
const VERSION = 1;
const MAX_PAYLOAD_BYTES = 32 * 1024;
const KINDS = new Set(['event', 'stdout', 'stderr', 'terminal']);
const TERMINAL_STATES = new Set(['completed', 'failed', 'cancelled']);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function payloadWithinLimit(payload) {
  try {
    return Buffer.byteLength(JSON.stringify(payload)) <= MAX_PAYLOAD_BYTES;
  } catch (_) { return false; }
}

function validTextPayload(payload) {
  return exactKeys(payload, ['text']) && typeof payload.text === 'string'
    && payload.text.length > 0;
}

function validEventPayload(payload) {
  return exactKeys(payload, ['name', 'detail']) && typeof payload.name === 'string'
    && payload.name.length > 0 && payload.name.length <= 128;
}

function validTerminalPayload(payload) {
  return exactKeys(payload, ['state', 'detail']) && TERMINAL_STATES.has(payload.state);
}

function payloadValidator(kind) {
  if (kind === 'stdout' || kind === 'stderr') return validTextPayload;
  if (kind === 'event') return validEventPayload;
  if (kind === 'terminal') return validTerminalPayload;
  return null;
}

function validPayload(kind, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  if (!payloadWithinLimit(payload)) return false;
  return Boolean(payloadValidator(kind)?.(payload));
}

function validHeader(message) {
  return exactKeys(message, ['type', 'protocolVersion', 'epoch', 'sequence',
    'runtimeInstanceId', 'lineage', 'kind', 'payload'])
    && message.type === TYPE && message.protocolVersion === VERSION
    && UUID_V4.test(message.epoch || '');
}

function validSequence(message) {
  return Number.isSafeInteger(message.sequence) && message.sequence > 0;
}

function matchesRuntime(message, expected) {
  return message.runtimeInstanceId === expected.runtimeInstanceId
    && reconnectProtocol.exactLineage(message.lineage, expected.lineage);
}

function valid(message, expected) {
  return validHeader(message) && validSequence(message)
    && matchesRuntime(message, expected) && KINDS.has(message.kind)
    && validPayload(message.kind, message.payload);
}

function create(input) {
  return Object.freeze({ type: TYPE, protocolVersion: VERSION, epoch: input.epoch,
    sequence: input.sequence, runtimeInstanceId: input.runtimeInstanceId,
    lineage: Object.freeze({ ...input.lineage }), kind: input.kind,
    payload: Object.freeze({ ...input.payload }) });
}

function freshEpoch() { return crypto.randomUUID(); }

module.exports = { TYPE, VERSION, MAX_PAYLOAD_BYTES, create, freshEpoch, valid };
