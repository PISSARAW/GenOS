'use strict';

const crypto = require('crypto');
const { migrateBiologicalExecutionReceipts } = require('../db/migrations/migrateBiologicalExecutionReceipts');

const RECEIPT_SCHEMA = 'genos.biological-execution-receipt/v1';

async function ingestBiologicalReceipt(db, receipt) {
  const normalized = validateReceipt(receipt);
  await migrateBiologicalExecutionReceipts(db);
  const encoded = stableJson(normalized);
  const payloadHash = crypto.createHash('sha256').update(encoded).digest('hex');
  const existing = await db.get('SELECT payload_hash FROM biological_execution_receipts WHERE receipt_id = ?', normalized.receipt_id);
  if (existing) return existingReceipt(existing, payloadHash, normalized.receipt_id);
  if (!await db.get('SELECT mission_id FROM missions WHERE mission_id = ?', normalized.mission_id)) {
    throw receiptError('BIOLOGICAL_RECEIPT_MISSION_NOT_FOUND');
  }
  const homeostasis = await latestHomeostasis(db, normalized.mission_id);
  const inserted = await insertReceipt(db, { normalized, encoded, payloadHash, homeostasis });
  if (inserted.changes !== 1) {
    const concurrent = await db.get('SELECT payload_hash FROM biological_execution_receipts WHERE receipt_id = ?', normalized.receipt_id);
    return existingReceipt(concurrent, payloadHash, normalized.receipt_id);
  }
  return { receiptId: normalized.receipt_id, duplicate: false, payloadHash, homeostasis };
}

async function attachOrphanedReceiptsToHomeostasis(db, missionId, homeostasis) {
  await migrateBiologicalExecutionReceipts(db);
  if (!homeostasis?.id || !homeostasis.status) return { changes: 0 };
  return db.run(`UPDATE biological_execution_receipts
    SET homeostasis_state_id = ?, homeostasis_status = ?
    WHERE mission_id = ? AND homeostasis_state_id IS NULL`,
  homeostasis.id, homeostasis.status, missionId);
}

function validateReceipt(receipt) {
  validateEnvelope(receipt);
  validateOperation(receipt);
  validateCost(receipt);
  validateOutcome(receipt);
  validateScope(receipt);
  return { ...receipt, tick: normalizedTick(receipt.tick) };
}

function validateEnvelope(receipt) {
  if (!receipt || receipt.schema !== RECEIPT_SCHEMA) throw receiptError('BIOLOGICAL_RECEIPT_SCHEMA_INVALID');
  if (!isUuid(receipt.receipt_id) || !isUuid(receipt.mission_id)) throw receiptError('BIOLOGICAL_RECEIPT_IDENTITY_INVALID');
}

function validateOperation(receipt) {
  if (typeof receipt.operation !== 'string' || !receipt.operation.trim()) throw receiptError('BIOLOGICAL_RECEIPT_OPERATION_INVALID');
}

function validateCost(receipt) {
  const validCost = Number.isFinite(receipt.cost) && receipt.cost >= 0;
  const validUnit = typeof receipt.cost_unit === 'string' && receipt.cost_unit.trim();
  if (!validCost || !validUnit) throw receiptError('BIOLOGICAL_RECEIPT_COST_INVALID');
}

function validateOutcome(receipt) {
  if (typeof receipt.consumed !== 'boolean' || typeof receipt.completed !== 'boolean') throw receiptError('BIOLOGICAL_RECEIPT_OUTCOME_INVALID');
}

function validateScope(receipt) {
  if (receipt.execution_scope !== 'organism') throw receiptError('BIOLOGICAL_RECEIPT_SCOPE_INVALID');
  if (Boolean(receipt.cell_id) !== Boolean(receipt.genome_id)) throw receiptError('BIOLOGICAL_RECEIPT_CELL_GENOME_INCOMPLETE');
}

function normalizedTick(tick) {
  return Number.isSafeInteger(tick) && tick >= 0 ? tick : null;
}

async function latestHomeostasis(db, missionId) {
  return db.get(`SELECT id, status FROM homeostasis_states WHERE mission_id = ? ORDER BY observed_at DESC, id DESC LIMIT 1`, missionId) || null;
}

async function insertReceipt(db, input) {
  const { normalized: receipt, encoded, payloadHash, homeostasis } = input;
  const hasIdentity = Boolean(receipt.cell_id && receipt.genome_id);
  return db.run(`INSERT OR IGNORE INTO biological_execution_receipts
    (receipt_id, mission_id, receipt_schema, tick, operation, cost, cost_unit, cell_id, genome_id,
     identity_status, payload_hash, receipt_json, homeostasis_state_id, homeostasis_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    receipt.receipt_id, receipt.mission_id, receipt.schema, receipt.tick, receipt.operation,
    receipt.cost, receipt.cost_unit, receipt.cell_id || null, receipt.genome_id || null,
    hasIdentity ? 'resolved' : 'organism_scope', payloadHash, encoded, homeostasis?.id || null, homeostasis?.status || null
  ]);
}

function existingReceipt(existing, payloadHash, receiptId) {
  if (existing.payload_hash !== payloadHash) throw receiptError('BIOLOGICAL_RECEIPT_ID_CONFLICT');
  return { receiptId, duplicate: true, payloadHash };
}

function stableJson(value) {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))));
}

function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function receiptError(code) {
  return Object.assign(new Error(code), { code });
}

module.exports = { RECEIPT_SCHEMA, ingestBiologicalReceipt, attachOrphanedReceiptsToHomeostasis, validateReceipt };
