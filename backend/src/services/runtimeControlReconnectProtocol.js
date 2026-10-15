'use strict';

const crypto = require('node:crypto');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');

const VERSION = 1;
const SCHEMA = 'genos.runtime-control-reconnect/v1';
const CHALLENGE = 'genos-runtime-control-reconnect-challenge';
const RESPONSE = 'genos-runtime-control-reconnect-response';
const ACTIVATE = 'genos-runtime-control-reconnect-activate';
const LINEAGE_FIELDS = Object.freeze([
  'workerId', 'missionId', 'episodeId', 'threadId', 'organizationId', 'projectId'
]);
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('\0') === [...keys].sort().join('\0');
}

function exactLineage(left, right) {
  return LINEAGE_FIELDS.every(field => typeof left?.[field] === 'string'
    && left[field] && left[field] === right?.[field]);
}

function keyId(publicKey) {
  const key = publicKey?.type === 'public' ? publicKey : crypto.createPublicKey(publicKey);
  const der = key.export({ type: 'spki', format: 'der' });
  return `sha256:${crypto.createHash('sha256').update(der).digest('hex')}`;
}

function unsigned(message) {
  const copy = { ...message };
  delete copy.signature;
  return Buffer.from(canonicalJson(copy));
}

function signature(message, privateKey) {
  return crypto.sign(null, unsigned(message), privateKey).toString('base64url');
}

function verifies(message, publicKey) {
  try {
    return crypto.verify(null, unsigned(message), publicKey,
      Buffer.from(message.signature || '', 'base64url'));
  } catch (_) { return false; }
}

function descriptor(input) {
  return Object.freeze({
    schema: SCHEMA, protocolVersion: VERSION, endpoint: Object.freeze({ ...input.endpoint }),
    runtimeInstanceId: input.runtimeInstanceId, lineage: Object.freeze({ ...input.lineage }),
    processIdentity: Object.freeze({ ...input.processIdentity }),
    runtimePublicKey: input.runtimePublicKey, backendKeyId: input.backendKeyId
  });
}

function validDescriptor(value) {
  return exactDescriptorShape(value) && hasDescriptorVersion(value) && validEndpoint(value.endpoint)
    && validRuntimeInstance(value) && exactLineage(value.lineage, value.lineage)
    && validProcessIdentity(value.processIdentity) && validDescriptorKeys(value);
}

function exactDescriptorShape(value) {
  return exactKeys(value, ['schema', 'protocolVersion', 'endpoint', 'runtimeInstanceId',
    'lineage', 'processIdentity', 'runtimePublicKey', 'backendKeyId'])
    && exactKeys(value?.endpoint, ['host', 'port'])
    && exactKeys(value?.processIdentity, ['pid', 'startMarker'])
    && exactKeys(value?.lineage, LINEAGE_FIELDS);
}

function hasDescriptorVersion(value) {
  return value?.schema === SCHEMA && value.protocolVersion === VERSION;
}

function validEndpoint(endpoint) {
  return endpoint?.host === '127.0.0.1' && Number.isInteger(endpoint.port)
    && endpoint.port > 0 && endpoint.port <= 65535;
}

function validRuntimeInstance(value) {
  return UUID_V4.test(value.runtimeInstanceId || '');
}

function validProcessIdentity(identity) {
  return Number.isInteger(identity?.pid) && identity.pid > 0
    && UUID_V4.test(identity.startMarker || '');
}

function validDescriptorKeys(value) {
  return typeof value.runtimePublicKey === 'string' && ed25519Public(value.runtimePublicKey)
    && /^sha256:[0-9a-f]{64}$/.test(value.backendKeyId || '');
}

function ed25519Public(value) {
  try { return crypto.createPublicKey(value).asymmetricKeyType === 'ed25519'; }
  catch (_) { return false; }
}

function createChallenge(input) {
  if (!validDescriptor(input.descriptor)) throw new Error('Invalid reconnect descriptor.');
  if (keyId(input.backendPrivateKey) !== input.descriptor.backendKeyId) {
    throw new Error('Backend signing key does not match reconnect authority.');
  }
  const message = {
    type: CHALLENGE, protocolVersion: VERSION, reconnectId: crypto.randomUUID(),
    nonce: crypto.randomBytes(32).toString('base64url'),
    runtimeInstanceId: input.descriptor.runtimeInstanceId,
    lineage: input.descriptor.lineage,
    processIdentity: input.descriptor.processIdentity,
    backendKeyId: input.descriptor.backendKeyId
  };
  return Object.freeze({ ...message, signature: signature(message, input.backendPrivateKey) });
}

function validChallenge(message, context) {
  const keys = ['type', 'protocolVersion', 'reconnectId', 'nonce', 'runtimeInstanceId',
    'lineage', 'processIdentity', 'backendKeyId', 'signature'];
  return exactKeys(message, keys) && validChallengeFields(message)
    && matchesRuntimeDescriptor(message, context.descriptor)
    && message.backendKeyId === context.descriptor.backendKeyId
    && verifies(message, context.backendPublicKey);
}

function validChallengeFields(message) {
  return message.type === CHALLENGE && message.protocolVersion === VERSION
    && UUID_V4.test(message.reconnectId || '')
    && /^[A-Za-z0-9_-]{43}$/.test(message.nonce || '');
}

function matchesRuntimeDescriptor(message, descriptorValue) {
  return message.runtimeInstanceId === descriptorValue.runtimeInstanceId
    && exactLineage(message.lineage, descriptorValue.lineage)
    && canonicalJson(message.processIdentity) === canonicalJson(descriptorValue.processIdentity);
}

function createResponse(input) {
  const message = {
    type: RESPONSE, protocolVersion: VERSION,
    reconnectId: input.challenge.reconnectId, nonce: input.challenge.nonce,
    runtimeNonce: crypto.randomBytes(32).toString('base64url'),
    runtimeInstanceId: input.descriptor.runtimeInstanceId,
    lineage: input.descriptor.lineage, processIdentity: input.descriptor.processIdentity,
    runtimeKeyId: keyId(input.descriptor.runtimePublicKey)
  };
  return Object.freeze({ ...message, signature: signature(message, input.runtimePrivateKey) });
}

function validResponse(message, context) {
  const keys = ['type', 'protocolVersion', 'reconnectId', 'nonce', 'runtimeNonce',
    'runtimeInstanceId', 'lineage', 'processIdentity', 'runtimeKeyId', 'signature'];
  return exactKeys(message, keys) && validResponseFields(message, context.challenge)
    && matchesRuntimeDescriptor(message, context.descriptor)
    && message.runtimeKeyId === keyId(context.descriptor.runtimePublicKey)
    && verifies(message, context.descriptor.runtimePublicKey);
}

function validResponseFields(message, challenge) {
  return message.type === RESPONSE && message.protocolVersion === VERSION
    && message.reconnectId === challenge.reconnectId && message.nonce === challenge.nonce
    && /^[A-Za-z0-9_-]{43}$/.test(message.runtimeNonce || '');
}

module.exports = {
  ACTIVATE, CHALLENGE, RESPONSE, VERSION, createChallenge, createResponse,
  descriptor, exactLineage, keyId, validChallenge, validDescriptor, validResponse
};
