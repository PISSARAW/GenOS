'use strict';

const {
  AUDIT_ENTRY_SCHEMA,
  requiredText,
  sha256Hex,
  hmacHex,
  canonicalValue
} = require('./sakPrimitives');

const GENESIS_HASH = '0'.repeat(64);

function buildEntryBody(sequence, previousHash, event = {}) {
  return {
    schema: AUDIT_ENTRY_SCHEMA,
    sequence,
    timestampMs: Number.isFinite(event.timestampMs) ? Number(event.timestampMs) : Date.now(),
    eventType: requiredText(event.eventType, 'SAK_LOG_EVENT_TYPE_REQUIRED', 64),
    decision: requiredText(event.decision || 'info', 'SAK_LOG_DECISION_REQUIRED', 32),
    reasonCode: requiredText(event.reasonCode || 'OK', 'SAK_LOG_REASON_REQUIRED', 64),
    principalIds: canonicalValue(event.principalIds ?? {}),
    target: event.target ? String(event.target) : null,
    operation: event.operation ? String(event.operation) : null,
    grantId: event.grantId ? String(event.grantId) : null,
    details: canonicalValue(event.details ?? {}),
    previousHash
  };
}

function sealEntryBody(body, secret) {
  const entryHash = sha256Hex(body);
  const sealHmac = hmacHex(secret, { ...body, entryHash });
  return Object.freeze({
    ...body,
    principalIds: Object.freeze(body.principalIds),
    details: Object.freeze(body.details),
    entryHash,
    sealHmac
  });
}

function extractBodyFromEntry(entry) {
  return {
    schema: entry.schema,
    sequence: entry.sequence,
    timestampMs: entry.timestampMs,
    eventType: entry.eventType,
    decision: entry.decision,
    reasonCode: entry.reasonCode,
    principalIds: canonicalValue(entry.principalIds ?? {}),
    target: entry.target ?? null,
    operation: entry.operation ?? null,
    grantId: entry.grantId ?? null,
    details: canonicalValue(entry.details ?? {}),
    previousHash: entry.previousHash
  };
}

function verifySingleEntry(entry, expectedContext, secret) {
  if (!entry || typeof entry !== 'object') {
    return { valid: false, reason: 'entry_not_object', sequence: expectedContext.sequence };
  }
  if (entry.sequence !== expectedContext.sequence) {
    return { valid: false, reason: 'sequence_mismatch', sequence: expectedContext.sequence };
  }
  if (entry.previousHash !== expectedContext.previousHash) {
    return { valid: false, reason: 'previous_hash_link_broken', sequence: entry.sequence };
  }
  const body = extractBodyFromEntry(entry);
  const expectedHash = sha256Hex(body);
  if (entry.entryHash !== expectedHash) {
    return { valid: false, reason: 'entry_hash_mismatch', sequence: entry.sequence };
  }
  const expectedHmac = hmacHex(secret, { ...body, entryHash: expectedHash });
  if (entry.sealHmac !== expectedHmac) {
    return { valid: false, reason: 'hmac_seal_invalid', sequence: entry.sequence };
  }
  return { valid: true, entryHash: expectedHash };
}

function verifyAuthLogIntegrity(entries, secret) {
  const key = requiredText(secret, 'SAK_LOG_SECRET_REQUIRED', 512);
  if (!Array.isArray(entries)) {
    return { valid: false, entryCount: 0, failures: [{ reason: 'ledger_not_array', sequence: 0 }] };
  }
  const failures = [];
  let previousHash = GENESIS_HASH;
  for (let idx = 0; idx < entries.length; idx += 1) {
    const check = verifySingleEntry(entries[idx], { sequence: idx + 1, previousHash }, key);
    if (!check.valid) {
      failures.push({ sequence: check.sequence, reason: check.reason });
    }
    previousHash = entries[idx]?.entryHash || previousHash;
  }
  return {
    valid: failures.length === 0,
    entryCount: entries.length,
    headHash: entries.length > 0 ? entries[entries.length - 1].entryHash : GENESIS_HASH,
    failures
  };
}

function createTamperEvidentAuthLog(options = {}) {
  const secret = requiredText(
    options.secret || 'genos-sak-default-kernel-hmac-secret',
    'SAK_LOG_SECRET_REQUIRED',
    512
  );
  const entries = [];

  function append(event) {
    const previousHash = entries.length > 0 ? entries[entries.length - 1].entryHash : GENESIS_HASH;
    const body = buildEntryBody(entries.length + 1, previousHash, event);
    const sealed = sealEntryBody(body, secret);
    entries.push(sealed);
    return sealed;
  }

  function getEntries() {
    return entries.slice();
  }

  function verify(candidateEntries = entries) {
    return verifyAuthLogIntegrity(candidateEntries, secret);
  }

  return Object.freeze({
    append,
    getEntries,
    verify,
    genesisHash: GENESIS_HASH
  });
}

module.exports = {
  GENESIS_HASH,
  createTamperEvidentAuthLog,
  verifyAuthLogIntegrity
};
