'use strict';
const crypto = require('node:crypto');
const { digest } = require('./biologicalIntegrity');
const biology = require('./biologicalWorkerReceiptService');
const { DIVISION_RECEIPT_SCHEMA, validateDivisionReceipt } = require('./biologicalExecutionReceiptService');
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

async function collect(db, mission) {
  const scope = typeof mission === 'string' ? { id: mission } : mission;
  const missionId = scope.id;
  const team = await require('./aTeamCompletionEvidenceService')
    .latest(db, [missionId, scope.legacyAuthorityMissionId, scope.orchestratorAgentId]);
  if (team) return aTeamExecution(team);
  await migrateBiologicalExecutionReceipts(db);
  const registered = await db.get('SELECT mission_id FROM missions WHERE mission_id = ?', missionId);
  const workers = registered ? await biology.missionEvidence(db, missionId)
    : { satisfied: true, missing: [], rejected: [], receipts: [] };
  const rust = await rustReferences(db, missionId);
  if (registered) await require('../db/migrations/migrateHomeostasisAuthority').ensureCompletionGuard(db);
  const references = [...rust.references, ...workers.receipts.map(workerReference)].sort((a, b) => a.receiptId.localeCompare(b.receiptId));
  return { satisfied: workers.satisfied, missing: workers.missing, rejected: workers.rejected,
    workerCount: workers.receipts.length, references,
    verifiedRustDivisionReceipts: rust.verifiedDivisions, epoch: digest(references) };
}

function aTeamExecution(team) {
  const reference = { runtime: 'a-team', schema: team.completion.schema,
    receiptId: `a-team:${team.teamRunId}`, payloadHash: digest(team.completion),
    teamRunId: team.teamRunId, missionId: team.completion.missionId };
  return { satisfied: true, missing: [], rejected: [], kind: 'a_team',
    workerCount: team.completion.completedMemberIds.length, references: [reference],
    verifiedRustDivisionReceipts: [], epoch: digest([reference]) };
}

function workerReference(receipt) {
  return { runtime: receipt.runtime, schema: receipt.schema, receiptId: receipt.receiptId,
    payloadHash: receipt.payloadHash, workerId: receipt.workerId, runId: receipt.runId,
    cellId: receipt.cellId, genomeId: receipt.genomeId, genomeHash: receipt.genomeHash };
}

async function rustReferences(db, missionId) {
  const rows = await db.all('SELECT * FROM biological_execution_receipts WHERE mission_id = ? ORDER BY receipt_id', missionId);
  const mapping = await db.get('SELECT rust_mission_id FROM biological_execution_missions WHERE mission_id = ?', missionId);
  const references = [];
  const verifiedDivisions = [];
  for (const row of rows) {
    const payload = JSON.parse(row.receipt_json);
    const hash = crypto.createHash('sha256').update(row.receipt_json).digest('hex');
    if (hash !== row.payload_hash || payload.mission_id !== missionId) throw new Error('Biological receipt integrity mismatch');
    assertReceiptColumnsMatchRow(row, payload);
    references.push({ runtime: receiptRuntime(row), origin: row.receipt_origin || null,
      schema: payload.schema, receiptId: row.receipt_id, payloadHash: hash,
      cellId: row.cell_id, genomeId: row.genome_id, genomeHash: payload.genome_fingerprint || null });
    const division = verifiedDivisionReference({ row, payload, hash, missionId, rustMissionId: mapping?.rust_mission_id });
    if (division) verifiedDivisions.push(division);
  }
  return { references, verifiedDivisions };
}

function assertReceiptColumnsMatchRow(row, payload) {
  if (row.receipt_schema !== payload.schema || row.operation !== payload.operation
    || row.cost !== payload.cost || row.cost_unit !== payload.cost_unit
    || row.cell_id !== (payload.cell_id || null) || row.genome_id !== (payload.genome_id || null)) {
    throw new Error('Biological receipt column binding mismatch');
  }
}

function receiptRuntime(row) {
  if (row.receipt_origin === 'genos-rust-cli') return 'rust-organism';
  if (row.receipt_origin && row.origin_signature && row.origin_nonce) return 'authenticated-ingest';
  return 'unattributed-biological-receipt';
}

function verifiedDivisionReference(input) {
  const { row, payload, hash, missionId, rustMissionId } = input;
  if (payload.schema !== DIVISION_RECEIPT_SCHEMA || row.receipt_origin !== 'genos-rust-cli'
    || !rustMissionId || payload.rust_mission_id !== rustMissionId) return null;
  validateDivisionReceipt(payload);
  if (payload.operation !== 'cell_division' || payload.completed !== true) return null;
  return { receiptId: row.receipt_id, payloadHash: hash, schema: payload.schema,
    operation: payload.operation, completed: payload.completed, missionId,
    rustMissionId, parentCellId: payload.parent_cell_id, daughterCellId: payload.daughter_cell_id,
    parentGenomeId: payload.parent_genome_id, daughterGenomeId: payload.daughter_genome_id,
    lineageId: payload.lineage_id, generation: payload.generation };
}

function contextWithEvidence(context, execution) {
  const kinds = evidenceKinds(context.evidence).filter(kind => kind !== 'biological_worker_receipt');
  if (execution.kind === 'a_team') kinds.push('a_team_completion');
  if (execution.kind !== 'a_team' && execution.satisfied && execution.workerCount > 0) {
    kinds.push('biological_worker_receipt');
  }
  return { ...context, evidence: [...new Set(kinds)],
    verifiedRustDivisionReceipts: execution.verifiedRustDivisionReceipts || [] };
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
