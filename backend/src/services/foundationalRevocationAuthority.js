'use strict';

const crypto = require('node:crypto');
const { canonicalValue, fingerprint } = require('./stateFingerprint');

const LEDGER_SCHEMA = 'genos.foundational-qualification-revocations/v2';
const TRUST_SCHEMA = 'genos.foundational-qualification-authorities/v1';
const ENTRY_SCHEMA = 'genos.foundational-qualification-revocation/v1';
const GENESIS_HASH = '0'.repeat(64);

function failure(code) {
  return Object.assign(new Error(code), { code });
}

function hash(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function entryBody(input) {
  const body = { schema: ENTRY_SCHEMA, sequence: input.sequence,
    receiptHash: input.receiptHash, authorityId: input.authorityId,
    reason: input.reason, revokedAt: input.revokedAt,
    previousHash: input.previousHash || GENESIS_HASH };
  if (!Number.isInteger(body.sequence) || body.sequence < 1) throw failure('FOUNDATION_REVOCATION_SEQUENCE_INVALID');
  if (!hash(body.receiptHash) || !hash(body.previousHash)) throw failure('FOUNDATION_REVOCATION_HASH_INVALID');
  if (!text(body.authorityId) || !text(body.reason)) throw failure('FOUNDATION_REVOCATION_AUTHORITY_INVALID');
  if (Number.isNaN(Date.parse(body.revokedAt))) throw failure('FOUNDATION_REVOCATION_TIME_INVALID');
  return canonicalValue(body);
}

function payload(body) {
  return Buffer.from(JSON.stringify(canonicalValue(body)));
}

function issue(input) {
  const body = entryBody(input);
  let signature;
  try {
    signature = crypto.sign(null, payload(body), input.privateKey).toString('base64');
  } catch (_) {
    throw failure('FOUNDATION_REVOCATION_SIGNING_FAILED');
  }
  return { ...body, signature, entryHash: fingerprint({ ...body, signature }) };
}

function authorityMap(registry) {
  if (!registry || registry.schema !== TRUST_SCHEMA || !Array.isArray(registry.authorities)) {
    throw failure('FOUNDATION_REVOCATION_TRUST_INVALID');
  }
  const result = new Map();
  for (const authority of registry.authorities) {
    if (!text(authority?.id) || !text(authority.publicKey) || result.has(authority.id)) {
      throw failure('FOUNDATION_REVOCATION_TRUST_INVALID');
    }
    if (authority.status !== 'active') throw failure('FOUNDATION_REVOCATION_TRUST_INVALID');
    result.set(authority.id, authority.publicKey);
  }
  return result;
}

function verifySignature(entry, body, publicKey) {
  try {
    return crypto.verify(null, payload(body), publicKey,
      Buffer.from(entry.signature || '', 'base64'));
  } catch (_) {
    return false;
  }
}

function verifyEntry(input) {
  const body = entryBody(input.entry);
  if (body.sequence !== input.expectedSequence || body.previousHash !== input.previousHash) {
    throw failure('FOUNDATION_REVOCATION_CHAIN_INVALID');
  }
  const publicKey = input.authorities.get(body.authorityId);
  if (!publicKey || !verifySignature(input.entry, body, publicKey)) {
    throw failure('FOUNDATION_REVOCATION_SIGNATURE_INVALID');
  }
  const expectedHash = fingerprint({ ...body, signature: input.entry.signature });
  if (input.entry.entryHash !== expectedHash) throw failure('FOUNDATION_REVOCATION_ENTRY_TAMPERED');
  return body;
}

function inspect(input) {
  try {
    if (Number.isNaN(Date.parse(input.now))) throw failure('FOUNDATION_REVOCATION_TIME_INVALID');
    if (!input.ledger || input.ledger.schema !== LEDGER_SCHEMA
      || !Array.isArray(input.ledger.revocations)) {
      throw failure('FOUNDATION_REVOCATION_LEDGER_INVALID');
    }
    const authorities = authorityMap(input.trustRegistry);
    const activeReceiptHashes = [];
    let previousHash = GENESIS_HASH;
    for (let index = 0; index < input.ledger.revocations.length; index += 1) {
      const entry = input.ledger.revocations[index];
      const body = verifyEntry({ entry, authorities, previousHash,
        expectedSequence: index + 1 });
      if (Date.parse(body.revokedAt) <= Date.parse(input.now)) {
        activeReceiptHashes.push(body.receiptHash);
      }
      previousHash = entry.entryHash;
    }
    return { valid: true, reason: null,
      activeReceiptHashes: [...new Set(activeReceiptHashes)].sort(), headHash: previousHash };
  } catch (error) {
    return { valid: false, reason: error.code || 'FOUNDATION_REVOCATION_LEDGER_INVALID',
      activeReceiptHashes: [], headHash: null };
  }
}

module.exports = { LEDGER_SCHEMA, TRUST_SCHEMA, ENTRY_SCHEMA, GENESIS_HASH,
  issue, inspect };
