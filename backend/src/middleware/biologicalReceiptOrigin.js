'use strict';

const crypto = require('node:crypto');
const { getDatabase } = require('../db');
const { validateReceipt } = require('../services/biologicalExecutionReceiptService');

const ORIGIN = 'genos-rust-orchestrator';
const FRESHNESS_SECONDS = 300;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RECEIPT_FIELDS = [
  'schema', 'receipt_id', 'mission_id', 'cell_id', 'genome_id', 'genome_fingerprint',
  'tick', 'execution_scope', 'operation', 'metabolic_register', 'cost', 'cost_unit',
  'consumed', 'completed', 'observed_at_unix_ms'
];

function fieldText(spec) {
  if (spec.field === 'cost') {
    const bytes = Buffer.alloc(8);
    bytes.writeDoubleLE(Number(spec.receipt.cost));
    return bytes.readBigUInt64LE().toString();
  }
  const value = spec.receipt[spec.field];
  if (value === null || value === undefined) return '';
  return typeof value === 'boolean' ? String(value) : String(value);
}

function payloadText(spec) {
  const { receipt, metadata } = spec;
  const fields = RECEIPT_FIELDS.map((field) => fieldText({ receipt, field }));
  if (receipt.population_json) fields.push(receipt.population_json);
  return [metadata.origin, metadata.timestamp, metadata.nonce, ...fields].join('\u0000');
}

function signReceipt(spec) {
  const payload = payloadText({ receipt: spec.receipt, metadata: spec.metadata });
  return crypto.createHmac('sha256', spec.secret).update(payload).digest('hex');
}

function validSignature(spec) {
  const { headers, secret } = spec;
  if (!validOriginMetadata({ headers, secret, now: spec.now })) return false;
  const { origin, timestamp, nonce, signature } = normalizeHeaders(headers);
  const expected = Buffer.from(signReceipt({ receipt: spec.receipt, metadata: { origin, timestamp, nonce }, secret }), 'hex');
  const received = Buffer.from(signature, 'hex');
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}

function normalizeHeaders(headers) {
  return {
    origin: headers.origin, timestamp: String(headers.timestamp || ''),
    nonce: String(headers.nonce || ''), signature: String(headers.signature || ''),
  };
}

function validOriginMetadata(spec) {
  const { origin, timestamp, nonce, signature } = normalizeHeaders(spec.headers);
  const now = spec.now ?? Math.floor(Date.now() / 1000);
  return Boolean(spec.secret) && origin === ORIGIN && /^\d{10}$/.test(timestamp)
    && UUID_PATTERN.test(nonce) && Math.abs(now - Number(timestamp)) <= FRESHNESS_SECONDS
    && /^[0-9a-f]{64}$/i.test(signature);
}

async function claimNonce(db, origin, nonce) {
  await db.exec(`CREATE TABLE IF NOT EXISTS biological_receipt_nonces (
    origin TEXT NOT NULL, nonce TEXT NOT NULL, received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (origin, nonce)
  )`);
  const result = await db.run('INSERT OR IGNORE INTO biological_receipt_nonces (origin, nonce) VALUES (?, ?)', origin, nonce);
  return result.changes === 1;
}

function reject(spec) {
  return spec.res.status(spec.status).json({ error: { code: spec.code, message: spec.message } });
}

function readOriginHeaders(req) {
  return {
    origin: req.get('x-genos-receipt-origin'), timestamp: req.get('x-genos-receipt-timestamp'),
    nonce: req.get('x-genos-receipt-nonce'), signature: req.get('x-genos-receipt-signature'),
  };
}

function rejectInvalidReceipt(res, error) {
  return reject({ res, status: 400, code: error.code || 'BIOLOGICAL_RECEIPT_INVALID', message: error.message });
}

async function requireBiologicalReceiptOrigin(req, res, next) {
  const secret = String(process.env.GENOS_RUST_RECEIPT_SECRET || '').trim();
  if (!secret) return reject({ res, status: 503, code: 'RUST_RECEIPT_AUTH_UNAVAILABLE', message: 'Rust receipt origin authentication is not configured.' });
  const receipt = req.body?.receipt || req.body;
  const headers = readOriginHeaders(req);
  try {
    validateReceipt(receipt);
  } catch (error) {
    return rejectInvalidReceipt(res, error);
  }
  if (!validSignature({ receipt, headers, secret })) {
    return reject({ res, status: 401, code: 'RUST_RECEIPT_SIGNATURE_INVALID', message: 'Rust receipt signature or timestamp is invalid.' });
  }
  try {
    const db = await getDatabase();
    if (!await claimNonce(db, headers.origin, headers.nonce)) {
      return reject({ res, status: 409, code: 'RUST_RECEIPT_REPLAYED', message: 'Rust receipt nonce has already been consumed.' });
    }
  } catch (error) {
    return next(error);
  }
  req.biologicalReceiptOrigin = { origin: headers.origin, signature: headers.signature, nonce: headers.nonce };
  return next();
}

module.exports = { ORIGIN, signReceipt, validSignature, claimNonce, requireBiologicalReceiptOrigin };
