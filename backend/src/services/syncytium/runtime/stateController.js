'use strict';

const { randomUUID } = require('node:crypto');

function createStateController(syncytium) {
  return { receive: (sessionId, event) => receive({ sessionId, event, syncytium }) };
}

async function receive(context) {
  const { sessionId, event, syncytium } = context;
  if (!event || typeof event !== 'object') throw runtimeError('Runtime event must be an object.');
  const options = event.options || {};
  if (event.transaction) return syncytium.applyTransaction(sessionId, event.transaction, options);
  if (Array.isArray(event.operations)) return applyBatch(sessionId, event, syncytium);
  if (event.operation) return syncytium.applyOperation(sessionId, event.operation, options);
  throw runtimeError('Runtime event requires an operation, operations list or transaction.');
}

function applyBatch(sessionId, event, syncytium) {
  if (!event.operations.length) throw runtimeError('Runtime operation batches cannot be empty.');
  if (event.operations.length === 1) return syncytium.applyOperation(sessionId, event.operations[0], event.options || {});
  return syncytium.applyTransaction(sessionId, {
    txId: event.txId || randomUUID(), operations: event.operations,
    preconditions: event.preconditions || [], commitPolicy: event.commitPolicy || 'SERIALIZABLE'
  }, event.options || {});
}

function runtimeError(message) {
  return Object.assign(new Error(message), { code: 'SYNCYTIUM_RUNTIME_EVENT_INVALID' });
}

module.exports = { createStateController };
