'use strict';
const crypto = require('node:crypto');
const { digest } = require('./biologicalIntegrity');
const biology = require('./biologicalWorkerReceiptService');
const { migrateBiologicalExecutionReceipts } = require('../db/migrations/migrateBiologicalExecutionReceipts');

async function missionScope(db, mission) {
  const id = mission.missionId || mission.id;
  if (await db.get('SELECT mission_id FROM missions WHERE mission_id = ?', id)) return { ...mission, id };
  const rows = await db.all(`SELECT mission_id FROM missions WHERE orchestrator_agent_id = ?
    AND status IN ('active', 'dormant') LIMIT 2`, id);
  if (rows.length > 1) throw new Error('Ambiguous durable mission for homeostasis');
  if (!rows.length) return { ...mission, id };
  return { ...mission, id: rows[0].mission_id, legacyAuthorityMissionId: id };
}

async function collect(db, missionId) {
  await migrateBiologicalExecutionReceipts(db);
  const registered = await db.get('SELECT mission_id FROM missions WHERE mission_id = ?', missionId);
  const workers = registered ? await biology.missionEvidence(db, missionId)
    : { satisfied: true, missing: [], rejected: [], receipts: [] };
  const rust = await rustReferences(db, missionId);
  if (registered) await require('../db/migrations/migrateHomeostasisAuthority').ensureCompletionGuard(db);
  const references = [...rust, ...workers.receipts.map(workerReference)].sort((a, b) => a.receiptId.localeCompare(b.receiptId));
  return { satisfied: workers.satisfied, missing: workers.missing, rejected: workers.rejected,
    workerCount: workers.receipts.length, references, epoch: digest(references) };
}

function workerReference(receipt) {
  return { runtime: receipt.runtime, schema: receipt.schema, receiptId: receipt.receiptId,
    payloadHash: receipt.payloadHash, workerId: receipt.workerId, runId: receipt.runId,
    cellId: receipt.cellId, genomeId: receipt.genomeId, genomeHash: receipt.genomeHash };
}

async function rustReferences(db, missionId) {
  const rows = await db.all('SELECT * FROM biological_execution_receipts WHERE mission_id = ? ORDER BY receipt_id', missionId);
  return rows.map(row => {
    const payload = JSON.parse(row.receipt_json);
    const hash = crypto.createHash('sha256').update(row.receipt_json).digest('hex');
    if (hash !== row.payload_hash || payload.mission_id !== missionId) throw new Error('Biological receipt integrity mismatch');
    return { runtime: 'rust-organism', schema: payload.schema, receiptId: row.receipt_id, payloadHash: hash,
      cellId: row.cell_id, genomeId: row.genome_id, genomeHash: payload.genome_fingerprint || null };
  });
}

function contextWithEvidence(context, execution) {
  const kinds = evidenceKinds(context.evidence).filter(kind => kind !== 'biological_worker_receipt');
  if (execution.satisfied && execution.workerCount > 0) kinds.push('biological_worker_receipt');
  return { ...context, evidence: [...new Set(kinds)] };
}

function evidenceKinds(value) {
  if (value instanceof Set) return [...value];
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.keys(value).filter(key => value[key] === true);
  return [];
}

function bindState(state, execution) {
  state.executionEvidence = execution;
  if (execution.satisfied) return state;
  state.homeostasisSatisfied = false;
  state.evidence.satisfied = false;
  state.evidence.missing.push(...execution.missing.map(id => `biological_worker_receipt:${id}`),
    ...execution.rejected.map(id => `biological_worker_result:${id}`));
  return state;
}

module.exports = { missionScope, collect, contextWithEvidence, bindState };
