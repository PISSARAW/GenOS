'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { ensureOutboxTables } = require('../storage/projection/projectionOutbox');
const { readReceipt } = require('./versionedContractService');

const DEFAULT_EVENT_TYPE = 'VERSIONED_CONTRACT_RECEIPT_STORED';

function invalidReceiptError(result) {
  const error = new Error('Invalid versioned contract receipt');
  error.code = 'INVALID_VERSIONED_RECEIPT';
  error.errors = result.errors;
  return error;
}

function hashPayload(payload) {
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function eventId(receiptId, eventType, payloadHash) {
  return `evt_${crypto.createHash('sha256').update(`${receiptId}:${eventType}:${payloadHash}`).digest('hex').slice(0, 24)}`;
}

function decodeReceipt(row) {
  if (!row) return null;
  return {
    schema: row.schema,
    contractType: row.contract_type,
    contractVersion: row.contract_version,
    receiptId: row.receipt_id,
    runId: row.run_id,
    sourceRefs: JSON.parse(row.source_refs_json),
    issuedAt: row.issued_at,
    payload: JSON.parse(row.payload_json),
  };
}

async function insertReceipt(db, receipt, payloadHash) {
  const existing = await db.get('SELECT receipt_id, payload_hash FROM versioned_contract_receipts WHERE receipt_id = ?', [receipt.receiptId]);
  if (existing && existing.payload_hash !== payloadHash) {
    const error = new Error(`Receipt ID already stores a different payload: ${receipt.receiptId}`);
    error.code = 'RECEIPT_ID_CONFLICT';
    throw error;
  }
  if (existing) return { inserted: false, receiptId: existing.receipt_id };
  const duplicate = await db.get('SELECT receipt_id FROM versioned_contract_receipts WHERE contract_type = ? AND contract_version = ? AND payload_hash = ?', [receipt.contractType, receipt.contractVersion, payloadHash]);
  if (duplicate) return { inserted: false, receiptId: duplicate.receipt_id };
  await db.run(`INSERT INTO versioned_contract_receipts
    (receipt_id, contract_type, contract_version, schema, run_id, source_refs_json, payload_json, payload_hash, issued_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    receipt.receiptId, receipt.contractType, receipt.contractVersion, receipt.schema,
    receipt.runId, JSON.stringify(receipt.sourceRefs), JSON.stringify(receipt.payload), payloadHash, receipt.issuedAt,
  ]);
  return { inserted: true, receiptId: receipt.receiptId };
}

async function insertProjectionEvent(db, receipt, options) {
  const { payloadHash, eventType } = options;
  const id = eventId(receipt.receiptId, eventType, payloadHash);
  const result = await db.run(`INSERT OR IGNORE INTO projection_events
    (event_id, aggregate_type, aggregate_id, event_type, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, datetime('now'))`, [
    id, 'versioned_contract_receipt', receipt.receiptId, eventType,
    JSON.stringify({ receiptId: receipt.receiptId, contractType: receipt.contractType, contractVersion: receipt.contractVersion, payloadHash }),
  ]);
  return { eventId: id, inserted: result?.changes === 1 };
}

async function persistReceipt(db, receipt, options = {}) {
  const validation = readReceipt(receipt);
  if (!validation.valid) throw invalidReceiptError(validation);
  await ensureOutboxTables(db);
  const payloadHash = hashPayload(receipt.payload);
  const eventType = options.eventType || DEFAULT_EVENT_TYPE;
  return withTransaction(db, async (transactionDb) => {
    const stored = await insertReceipt(transactionDb, receipt, payloadHash);
    const eventReceipt = stored.receiptId === receipt.receiptId ? receipt : { ...receipt, receiptId: stored.receiptId };
    const event = await insertProjectionEvent(transactionDb, eventReceipt, { payloadHash, eventType });
    return { receiptId: stored.receiptId, payloadHash, inserted: stored.inserted, eventId: event.eventId, eventInserted: event.inserted };
  });
}

async function loadReceipt(db, receiptId) {
  const row = await db.get('SELECT * FROM versioned_contract_receipts WHERE receipt_id = ?', [receiptId]);
  const receipt = decodeReceipt(row);
  if (!receipt) return null;
  const validation = readReceipt(receipt);
  if (!validation.valid) throw invalidReceiptError(validation);
  return receipt;
}

async function listReceiptEvents(db, receiptId) {
  return db.all('SELECT * FROM projection_events WHERE aggregate_type = ? AND aggregate_id = ? ORDER BY sequence ASC', ['versioned_contract_receipt', receiptId]);
}

module.exports = { persistReceipt, loadReceipt, listReceiptEvents };
