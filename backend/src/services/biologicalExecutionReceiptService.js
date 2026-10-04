'use strict';

const crypto = require('crypto');
const { populationFromReceipt, persistPopulation } = require('./rustPopulationRegistry');
const { migrateBiologicalExecutionReceipts } = require('../db/migrations/migrateBiologicalExecutionReceipts');

const RECEIPT_SCHEMA = 'genos.biological-execution-receipt/v1';

async function ingestBiologicalReceipt(db, receipt, options = {}) {
  const normalized = validateReceipt(receipt);
  if (options.backendMissionId) normalized.mission_id = options.backendMissionId;
  await migrateBiologicalExecutionReceipts(db);
  const encoded = stableJson(normalized);
  const payloadHash = crypto.createHash('sha256').update(encoded).digest('hex');
  const existing = await db.get('SELECT payload_hash FROM biological_execution_receipts WHERE receipt_id = ?', normalized.receipt_id);
  if (existing) {
    const result = existingReceipt(existing, payloadHash, normalized.receipt_id);
    await persistPopulation(db, normalized);
    return result;
  }
  if (!await db.get('SELECT mission_id FROM missions WHERE mission_id = ?', normalized.mission_id)) {
    throw receiptError('BIOLOGICAL_RECEIPT_MISSION_NOT_FOUND');
  }
  if (populationFromReceipt(normalized) && !origin?.signature) throw receiptError("BIOLOGICAL_RECEIPT_POPULATION_ORIGIN_REQUIRED");
  const homeostasis = await latestHomeostasis(db, normalized.mission_id);
  const inserted = await insertReceipt(db, { normalized, encoded, payloadHash, homeostasis, origin: options.origin });
  if (inserted.changes !== 1) {
    const concurrent = await db.get('SELECT payload_hash FROM biological_execution_receipts WHERE receipt_id = ?', normalized.receipt_id);
    return existingReceipt(concurrent, payloadHash, normalized.receipt_id);
  }
  await persistPopulation(db, normalized);
  return { receiptId: normalized.receipt_id, duplicate: false, payloadHash, homeostasis };
}

async function runMissionTick(db, input = {}) {
  await migrateBiologicalExecutionReceipts(db);
  const missionId = String(input.missionId || '').trim();
  if (!missionId) throw receiptError('BIOLOGICAL_RECEIPT_MISSION_REQUIRED');
  const mission = await db.get('SELECT mission_id, objective, status FROM missions WHERE mission_id = ?', missionId);
  await assertTickMissionScope(db, mission, input);
  const mapping = await getOrCreateRustMission(db, missionId);
  const result = await executeRustMissionTick(input, mission, mapping);
  const payload = validateRustTickResult(result, mapping.rust_mission_id);
  const persisted = await persistRustTickReceipts({ db, missionId, mapping, receipts: payload.receipts });
  return { missionId, rustMissionId: mapping.rust_mission_id, tick: payload.tick, receipts: persisted };
}

async function assertTickMissionScope(db, mission, input) {
  if (!mission) throw receiptError('BIOLOGICAL_RECEIPT_MISSION_NOT_FOUND');
  if (mission.status !== 'active') throw receiptError('BIOLOGICAL_TICK_MISSION_INACTIVE');
  if (!input.organizationId && !input.projectId) return;
  const member = await db.get(`SELECT 1 AS allowed FROM mission_agents ma
    JOIN agents a ON a.id = ma.agent_id
    WHERE ma.mission_id = ? AND a.organization_id IS ? AND a.project_id IS ? LIMIT 1`,
  mission.mission_id, input.organizationId || null, input.projectId || null);
  if (!member) throw receiptError('BIOLOGICAL_TICK_TENANT_SCOPE_DENIED');
}

async function getOrCreateRustMission(db, missionId) {
  let mapping = await db.get('SELECT rust_mission_id FROM biological_execution_missions WHERE mission_id = ?', missionId);
  if (mapping) return mapping;
  const rustMissionId = crypto.randomUUID();
  await db.run('INSERT OR IGNORE INTO biological_execution_missions (mission_id, rust_mission_id) VALUES (?, ?)', missionId, rustMissionId);
  mapping = await db.get('SELECT rust_mission_id FROM biological_execution_missions WHERE mission_id = ?', missionId);
  return mapping;
}

async function executeRustMissionTick(input, mission, mapping) {
  return require('./genosCli').runGenos([
    'biological', '--tick', '--mission-id', mapping.rust_mission_id,
    ...(input.divide === true ? ['--divide'] : []),
    '--mission', String(input.mission || mission.objective || mission.mission_id)
  ], { timeoutMs: input.timeoutMs });
}

function validateRustTickResult(result, rustMissionId) {
  const payload = result.json;
  if (!result.ok || payload?.operation !== 'biological_mission_tick'
    || payload.mission_id !== rustMissionId || !Array.isArray(payload.receipts)) {
    throw Object.assign(new Error(result.stderr?.trim() || result.error || 'Rust biological tick returned an invalid receipt envelope.'), { code: 'BIOLOGICAL_TICK_FAILED' });
  }
  return payload;
}

async function persistRustTickReceipts({ db, missionId, mapping, receipts }) {
  const executionReceipts = receipts.filter((item) => item.schema === RECEIPT_SCHEMA);
  const divisionReceipts = receipts.filter((item) => item.schema === DIVISION_RECEIPT_SCHEMA);
  const persisted = await persistExecutionReceipts({ db, missionId, mapping, receipts: executionReceipts });
  return persisted.concat(await persistRustDivisionReceipts({ db, missionId, mapping, receipts: divisionReceipts }));
}

async function persistExecutionReceipts({ db, missionId, mapping, receipts }) {
  const persisted = [];
  for (const receipt of receipts) {
    if (receipt.mission_id !== mapping.rust_mission_id) throw receiptError('BIOLOGICAL_TICK_RECEIPT_MISSION_MISMATCH');
    persisted.push(await ingestBiologicalReceipt(db, receipt, { origin: 'genos-rust-cli', backendMissionId: missionId }));
  }
  return persisted;
}

async function persistRustDivisionReceipts({ db, missionId, mapping, receipts }) {
  const persisted = [];
  for (const receipt of receipts) {
    if (receipt.mission_id !== mapping.rust_mission_id) throw receiptError('BIOLOGICAL_TICK_RECEIPT_MISSION_MISMATCH');
    persisted.push(await ingestDivisionReceipt(db, receipt, missionId));
  }
  return persisted;
}

const DIVISION_RECEIPT_SCHEMA = 'genos.cell-division-receipt/v1';
async function ingestDivisionReceipt(db, receipt, backendMissionId) {
  validateDivisionReceipt(receipt);
  await migrateBiologicalExecutionReceipts(db);
  if (!await db.get('SELECT mission_id FROM missions WHERE mission_id = ?', backendMissionId)) {
    throw receiptError('BIOLOGICAL_RECEIPT_MISSION_NOT_FOUND');
  }
  const normalized = { ...receipt, mission_id: backendMissionId, operation: 'cell_division',
    cost: receipt.consumed_cost, cost_unit: receipt.cost_unit, cell_id: receipt.parent_cell_id,
    genome_id: receipt.parent_genome_id, tick: null };
  const encoded = stableJson(normalized);
  const payloadHash = crypto.createHash('sha256').update(encoded).digest('hex');
  const existing = await db.get('SELECT payload_hash FROM biological_execution_receipts WHERE receipt_id = ?', receipt.receipt_id);
  if (existing) return existingReceipt(existing, payloadHash, receipt.receipt_id);
  const homeostasis = await latestHomeostasis(db, backendMissionId);
  const inserted = await insertReceipt(db, { normalized, encoded, payloadHash, homeostasis, origin: { origin: 'genos-rust-cli' } });
  if (inserted.changes !== 1) {
    const concurrent = await db.get('SELECT payload_hash FROM biological_execution_receipts WHERE receipt_id = ?', receipt.receipt_id);
    return existingReceipt(concurrent, payloadHash, receipt.receipt_id);
  }
  return { receiptId: receipt.receipt_id, duplicate: false, payloadHash, homeostasis,
    lineage: { parentCellId: receipt.parent_cell_id, daughterCellId: receipt.daughter_cell_id,
      parentGenomeId: receipt.parent_genome_id, daughterGenomeId: receipt.daughter_genome_id,
      lineageId: receipt.lineage_id, generation: receipt.generation, completed: receipt.completed } };
}

function validateDivisionReceipt(receipt) {
  validateDivisionIdentity(receipt);
  validateDivisionCost(receipt);
  validateDivisionLineage(receipt);
}

function validateDivisionIdentity(receipt) {
  if (receipt?.schema === DIVISION_RECEIPT_SCHEMA && isUuid(receipt.receipt_id) && isUuid(receipt.mission_id)) return;
  throw receiptError('BIOLOGICAL_DIVISION_RECEIPT_IDENTITY_INVALID');
}

function validateDivisionCost(receipt) {
  if (Number.isFinite(receipt.requested_cost) && receipt.requested_cost >= 0
    && Number.isFinite(receipt.consumed_cost) && receipt.consumed_cost >= 0
    && typeof receipt.cost_unit === 'string' && receipt.cost_unit.trim()
    && typeof receipt.completed === 'boolean') return;
  throw receiptError('BIOLOGICAL_DIVISION_RECEIPT_COST_INVALID');
}

function validateDivisionLineage(receipt) {
  const ids = ['parent_cell_id', 'daughter_cell_id', 'parent_genome_id', 'daughter_genome_id', 'lineage_id'];
  for (const key of ids) if (receipt[key] !== null && receipt[key] !== undefined && !isUuid(receipt[key]))
    throw receiptError('BIOLOGICAL_DIVISION_RECEIPT_LINEAGE_INVALID');
  if (!receipt.completed) return;
  const complete = ['parent_cell_id', 'daughter_cell_id', 'parent_genome_id', 'daughter_genome_id', 'lineage_id']
    .every((key) => Boolean(receipt[key]));
  if (complete && Number.isSafeInteger(receipt.generation)) return;
  throw receiptError('BIOLOGICAL_DIVISION_RECEIPT_LINEAGE_INCOMPLETE');
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
  const { normalized: receipt, encoded, payloadHash, homeostasis, origin } = input;
  const hasIdentity = Boolean(receipt.cell_id && receipt.genome_id);
  return db.run(`INSERT OR IGNORE INTO biological_execution_receipts
    (receipt_id, mission_id, receipt_schema, tick, operation, cost, cost_unit, cell_id, genome_id,
     identity_status, payload_hash, receipt_json, homeostasis_state_id, homeostasis_status,
     receipt_origin, origin_signature, origin_nonce)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    receipt.receipt_id, receipt.mission_id, receipt.schema, receipt.tick, receipt.operation,
    receipt.cost, receipt.cost_unit, receipt.cell_id || null, receipt.genome_id || null,
    hasIdentity ? 'resolved' : 'organism_scope', payloadHash, encoded, homeostasis?.id || null, homeostasis?.status || null,
    origin?.origin || null, origin?.signature || null, origin?.nonce || null
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

module.exports = { RECEIPT_SCHEMA, DIVISION_RECEIPT_SCHEMA, ingestBiologicalReceipt, runMissionTick, attachOrphanedReceiptsToHomeostasis, validateReceipt, validateDivisionReceipt };
