'use strict';
const crypto = require('node:crypto');
const { verifiedJson } = require('./biologicalWorkerStore');
const { loadRow } = require('./homeostasisAuthorityStore');

function queryLimit(value) {
  const limit = value === undefined ? 50 : Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw Object.assign(new Error('Receipt query limit must be an integer from 1 to 100'), { code: 'BIOLOGICAL_RECEIPT_QUERY_INVALID' });
  }
  return limit;
}

async function rows(db, input) {
  const table = await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", input.table);
  if (!table) return [];
  return db.all(`SELECT * FROM ${input.table} WHERE mission_id = ? ORDER BY rowid DESC LIMIT ?`, input.missionId, input.limit);
}

function rawReceipt(row) {
  const text = row.receipt_json;
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  if (hash !== (row.payload_hash || row.receipt_hash)) throw new Error('Biological audit receipt integrity mismatch');
  return { receipt: JSON.parse(text), payloadHash: hash };
}

async function missionAudit(db, input) {
  const limit = queryLimit(input.limit);
  const request = { missionId: input.missionId, limit };
  const control = await rows(db, { ...request, table: 'biological_execution_receipts' });
  const workers = await rows(db, { ...request, table: 'biological_worker_receipts' });
  const bindings = await rows(db, { ...request, table: 'biological_worker_bindings' });
  const revisions = await rows(db, { ...request, table: 'homeostasis_contract_revisions' });
  const transitions = await rows(db, { ...request, table: 'homeostasis_transition_receipts' });
  const hasHeads = await db.get("SELECT name FROM sqlite_master WHERE name = 'homeostasis_contract_heads'");
  const head = hasHeads && await db.get(`SELECT r.* FROM homeostasis_contract_revisions r JOIN homeostasis_contract_heads h
    ON h.mission_id = r.mission_id AND h.revision = r.revision WHERE r.mission_id = ?`, input.missionId);
  const active = head && loadRow(head);
  return { schema: 'genos.biological-mission-audit/v1', missionId: input.missionId, limit,
    controlReceipts: control.map(rawReceipt),
    workerReceipts: workers.map(row => ({ receipt: verifiedJson(row, 'receipt_json'), payloadHash: row.payload_hash })),
    workerBindings: bindings.map(row => verifiedJson(row, 'binding_json')),
    activeAuthority: active ? { revision: active.revision, contractHash: active.contractHash } : null,
    contractRevisions: revisions.map(loadRow).map(withoutClosures), transitionReceipts: transitions.map(rawReceipt) };
}

function withoutClosures(contract) {
  return { ...contract, invariants: contract.invariants.map(({ check, ...invariant }) => invariant) };
}

module.exports = { missionAudit, queryLimit };
