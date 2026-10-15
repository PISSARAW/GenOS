'use strict';

const crypto = require('node:crypto');
const reassociation = require('./runtimeControlReassociation');
const protocol = require('./runtimeControlReconnectProtocol');

function failure(message) {
  return Object.assign(new Error(message), { code: 'RUNTIME_RECONNECT_BACKEND_KEY_INVALID' });
}

function privateKey(value) {
  try {
    const key = value?.type === 'private' ? value : crypto.createPrivateKey(value);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('wrong key type');
    return key;
  } catch (_) { throw failure('A valid durable backend signing key using Ed25519 is required.'); }
}

function matchingKey(records, key) {
  const id = protocol.keyId(key);
  return records.every(record => record?.descriptor?.backendKeyId === id);
}

async function recoverOne(record, options) {
  try {
    const reconnect = options.reassociate || reassociation.reassociate;
    const proof = await reconnect({
      descriptor: record.descriptor,
      expectedLineage: record.expectedLineage,
      backendPrivateKey: options.backendPrivateKey,
      timeoutMs: options.timeoutMs,
      readyTimeoutMs: options.readyTimeoutMs
    });
    return { recordId: record.id, ...proof };
  } catch (error) {
    return { recordId: record.id, proven: false,
      code: 'RUNTIME_CONTROL_REASSOCIATION_REFUSED', detail: error.message };
  }
}

async function recover(options) {
  if (!options?.store || typeof options.store.listReconnectAuthorities !== 'function') {
    throw new Error('A durable reconnect authority store is required.');
  }
  const records = options.records || await options.store.listReconnectAuthorities();
  if (!Array.isArray(records)) throw new Error('Reconnect authority store returned invalid data.');
  if (!records.length) return [];
  const backendPrivateKey = privateKey(options.backendPrivateKey);
  if (!matchingKey(records, backendPrivateKey)) throw failure(
    'Backend signing key does not match every recoverable authority.');
  const results = [];
  const exact = { ...options, backendPrivateKey };
  for (const record of records) results.push(await recoverOne(record, exact));
  return results;
}

module.exports = { privateKey, recover };
