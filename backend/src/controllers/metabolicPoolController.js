'use strict';

const { getDatabase } = require('../db');
const { missionBelongsToTenant } = require('./biologicalReceiptController');
const cli = require('../services/genosCli');

async function consume(req, res, next) {
  try {
    const input = normalizeInput(req.body);
    if (!input) return res.status(400).json({ error: { code: 'METABOLIC_REQUEST_INVALID', message: 'A mission, cell, operation, quantity, tick, and idempotency key are required.' } });
    const db = await getDatabase();
    if (!await missionBelongsToTenant(db, input.missionId, req.tenant)) {
      return res.status(404).json({ error: { code: 'MISSION_NOT_FOUND', message: 'Mission is not available in this project.' } });
    }
    const context = await missionContext(db, input);
    if (!context) return res.status(409).json({ error: { code: 'METABOLIC_MISSION_STATE_UNAVAILABLE', message: 'No current durable cell state is registered for this mission.' } });
    if (context.cellTick !== input.tick || context.latestTick !== input.tick) {
      return res.status(409).json({ error: { code: 'METABOLIC_TICK_MISMATCH', message: 'The requested tick is not the current registered mission tick.' } });
    }
    return await executeMetabolicPool({ req, res, input, rustMissionId: context.rustMissionId });
  } catch (error) { return next(error); }
}

function normalizeInput(body) {
  const missionId = validUuid(body?.missionId);
  const cellId = validUuid(body?.cellId);
  const idempotencyKey = String(body?.idempotencyKey || '').trim();
  const operation = String(body?.operation || '').trim();
  const aminoAcids = Number(body?.aminoAcids);
  const tick = Number(body?.tick);
  if (!validIdentity(missionId, cellId, idempotencyKey)) return null;
  if (!validOperation(operation)) return null;
  if (!validQuantity(aminoAcids) || !validTick(tick)) return null;
  return { missionId, cellId, idempotencyKey, operation, aminoAcids, tick };
}

function validIdentity(missionId, cellId, idempotencyKey) {
  if (!missionId || !cellId) return false;
  return Boolean(idempotencyKey && idempotencyKey.length <= 256);
}

function validOperation(operation) {
  return Boolean(operation && operation.length <= 256);
}

function validQuantity(aminoAcids) {
  return Number.isFinite(aminoAcids) && aminoAcids >= 0;
}

function validTick(tick) {
  return Number.isSafeInteger(tick) && tick >= 0;
}

function validUuid(value) {
  const normalized = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized : null;
}

async function missionContext(db, input) {
  const runtime = await db.get('SELECT rust_mission_id FROM biological_execution_missions WHERE mission_id=?', input.missionId);
  const cell = await db.get('SELECT tick FROM rust_cell_registry WHERE mission_id=? AND cell_id=?', input.missionId, input.cellId);
  const latest = await db.get('SELECT MAX(tick) AS tick FROM rust_cell_registry WHERE mission_id=?', input.missionId);
  if (!cell || latest?.tick === null || latest?.tick === undefined) return null;
  return { rustMissionId: runtime?.rust_mission_id || input.missionId, cellTick: Number(cell.tick), latestTick: Number(latest.tick) };
}

async function executeMetabolicPool(input) {
  const { req, res, input: command, rustMissionId } = input;
  const args = ['metabolic-pool', '--mission-id', rustMissionId, '--cell-id', command.cellId,
    '--idempotency-key', command.idempotencyKey, '--operation', command.operation,
    '--amino-acids', String(command.aminoAcids), '--tick', String(command.tick), '--experimental'];
  const run = await cli.runGenos(args);
  if (!successfulRun(run, command, rustMissionId)) {
    return res.status(502).json({ error: { code: 'METABOLIC_RUST_EXECUTION_FAILED', message: run.stderr?.trim() || run.error || 'Durable metabolic executor failed.' } });
  }
  return res.json({ operation: 'metabolic_pool', missionId: command.missionId,
    idempotencyKey: command.idempotencyKey,
    backendAuthorization: { principalId: req.user?.keyId || req.user?.username || 'authenticated_api_principal',
      permission: 'experiment:run', tenantScoped: true },
    rust: run.json });
}

function successfulRun(run, command, rustMissionId) {
  const identity = run?.json;
  const receipt = identity?.receipt;
  return run?.ok === true && identity?.success === true && Boolean(receipt)
    && operationIdentityMatches({ identity, command, rustMissionId })
    && operationReceiptMatches({ receipt, command, rustMissionId });
}

function operationIdentityMatches(input) {
  const { identity, command, rustMissionId } = input;
  return identity.execution_mode === 'experimental'
    && identity.mission_authority === 'unverified_cli_claim'
    && identity.mission_id === rustMissionId && identity.cell_id === command.cellId
    && identity.idempotency_key === command.idempotencyKey
    && identity.operation === command.operation && identity.amino_acids === command.aminoAcids
    && identity.tick === command.tick;
}

function operationReceiptMatches(input) {
  const { receipt, command, rustMissionId } = input;
  return receipt.mission_id === rustMissionId && receipt.cell_id === command.cellId
    && receipt.operation === command.operation
    && receipt.requested_amino_acids === command.aminoAcids;
}

module.exports = { consume };
