'use strict';

const crypto = require('node:crypto');

function hashKey(key) {
  if (typeof key !== 'string' || !key.trim() || key.length > 1000) {
    throw new Error('Communication idempotency key must be a non-empty string of at most 1000 characters.');
  }
  return crypto.createHash('sha256').update(key.trim()).digest('hex');
}

function signalIdForKey(key) {
  return `sig_idem_${hashKey(key)}`;
}

function signalIdForParams(params) {
  if (!params.idempotencyKey) return params.signalId || `sig_${crypto.randomUUID()}`;
  const deterministicId = signalIdForKey(params.idempotencyKey);
  if (params.signalId && params.signalId !== deterministicId) {
    throw new Error('Signal ID does not match its idempotency key.');
  }
  return deterministicId;
}

module.exports = { hashKey, signalIdForKey, signalIdForParams };
