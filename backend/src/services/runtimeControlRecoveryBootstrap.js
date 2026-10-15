'use strict';

const reassociation = require('./runtimeControlReassociation');

async function recoverOne(record, options) {
  try {
    const proof = await reassociation.reassociate({
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
  if (!options.backendPrivateKey) throw new Error('A durable backend signing key is required.');
  const records = await options.store.listReconnectAuthorities();
  if (!Array.isArray(records)) throw new Error('Reconnect authority store returned invalid data.');
  const results = [];
  for (const record of records) results.push(await recoverOne(record, options));
  return results;
}

module.exports = { recover };
