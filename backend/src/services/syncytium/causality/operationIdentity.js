'use strict';

const { createHash } = require('node:crypto');

function digest(operation) {
  const identity = {
    actor: String(operation.actorId || operation.agentId || 'unknown').trim(),
    role: operation.role || null, domainId: operation.domainId || null,
    transactionId: operation.transactionId || null, kind: operation.kind || null
  };
  return createHash('sha256').update(JSON.stringify(canonical(identity))).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function assertSame(expected, operation) {
  if (expected && expected !== digest(operation)) {
    throw Object.assign(new Error('An operation ID cannot be reused with a different mutation or author.'), {
      code: 'SYNCYTIUM_OPERATION_ID_CONFLICT'
    });
  }
}

module.exports = { digest, assertSame };
