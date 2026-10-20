'use strict';
const { PROPAGULE_TYPES } = require('../constants');

const adapters = new Map();
const IDEMPOTENCY_CONTRACT = Object.freeze({
  version: 'genos.metapopulation-migration-adapter-idempotency/v1',
  keyField: 'idempotencyKey',
  operations: Object.freeze(['adapt', 'assimilate', 'rollback']),
  scope: 'adapter-operation',
  replayBehavior: 'RETURN_ORIGINAL_RECEIPT'
});

function registerAdapter(type, adapter) {
  if (!PROPAGULE_TYPES.includes(type) || !adapter || typeof adapter.validate !== 'function' || typeof adapter.assimilate !== 'function' || (adapter.rollback !== undefined && typeof adapter.rollback !== 'function')) {
    throw Object.assign(new Error('A supported propagule type and valid receiver adapter methods are required.'), { code: 'METAPOPULATION_ADAPTER_INVALID' });
  }
  if (adapters.has(type)) throw Object.assign(new Error('An adapter is already registered for this propagule type.'), { code: 'METAPOPULATION_ADAPTER_CONFLICT' });
  adapters.set(type, adapter);
  return { type, registered: true };
}

function resolveAdapter(type) {
  return adapters.get(type) || null;
}

function clearAdapter(type) {
  return adapters.delete(type);
}

async function invokeAdapter(adapter, operation, context) {
  if (!adapter || typeof adapter[operation] !== 'function') {
    throw adapterError('METAPOPULATION_ADAPTER_OPERATION_UNAVAILABLE', `Migration adapter operation is unavailable: ${operation}.`);
  }
  if (IDEMPOTENCY_CONTRACT.operations.includes(operation)) requireIdempotencyKey(context);
  return adapter[operation](context);
}

function requireIdempotencyKey(context) {
  const key = context?.[IDEMPOTENCY_CONTRACT.keyField];
  if (typeof key !== 'string' || !key.trim()) {
    throw adapterError('METAPOPULATION_ADAPTER_IDEMPOTENCY_KEY_REQUIRED',
      `Migration adapter operations require ${IDEMPOTENCY_CONTRACT.keyField}.`);
  }
  return key;
}

function adapterError(code, message) { return Object.assign(new Error(message), { code }); }

module.exports = { registerAdapter, resolveAdapter, clearAdapter, invokeAdapter, requireIdempotencyKey,
  IDEMPOTENCY_CONTRACT };
