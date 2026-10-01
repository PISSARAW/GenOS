'use strict';

const crypto = require('crypto');

const GENESIS_HASH = '0'.repeat(64);

function canonicalEvent(event) {
  return JSON.stringify({ id: event.id, organizationId: event.organizationId,
    projectId: event.projectId, entityId: event.entityId, type: event.type,
    parentHash: event.parentHash || null, candidateHash: event.candidateHash || null,
    payloadJson: event.payloadJson, createdAt: event.createdAt });
}

function hashEvent(previousEventHash, event) {
  return crypto.createHash('sha256').update(previousEventHash).update(canonicalEvent(event)).digest('hex');
}

function macEvent(eventHash, secret = process.env.GENOS_GVX_LEDGER_HMAC_SECRET) {
  if (!secret) return null;
  return crypto.createHmac('sha256', secret).update(eventHash).digest('hex');
}

function verifyRows(rows, options = {}) {
  let previous = GENESIS_HASH;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.previousEventHash !== previous) return invalid(index, 'previous-hash-mismatch');
    const expected = hashEvent(previous, row);
    if (row.eventHash !== expected) return invalid(index, 'event-hash-mismatch');
    if (row.controlPlaneMac && options.secret && row.controlPlaneMac !== macEvent(row.eventHash, options.secret)) {
      return invalid(index, 'control-plane-mac-mismatch');
    }
    previous = row.eventHash;
  }
  const macsPresent = rows.some((row) => row.controlPlaneMac);
  return { valid: true, eventCount: rows.length, headHash: previous,
    controlPlaneMac: macsPresent ? options.secret ? 'verified' : 'unverified' : 'not-configured' };
}

function invalid(index, reason) {
  return { valid: false, eventIndex: index, reason };
}

module.exports = { GENESIS_HASH, canonicalEvent, hashEvent, macEvent, verifyRows };
