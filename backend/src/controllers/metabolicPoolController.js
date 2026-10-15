'use strict';

const fs = require('node:fs/promises');
const { getDatabase } = require('../db');
const { missionBelongsToTenant } = require('./biologicalReceiptController');
const cli = require('../services/genosCli');
const { createAuthorityFile } = require('../services/metabolicCliAuthority');

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
  const authority = await createAuthorityFile({ root: cli.studioBridgeRoot(), tenant: req.tenant,
    claims: { mission_id: command.missionId, rust_mission_id: rustMissionId, cell_id: command.cellId,
      operation: 'metabolic_pool', detail: command.operation, value: String(command.aminoAcids),
      tick: command.tick, idempotency_key: command.idempotencyKey } });
  const args = ['metabolic-pool', '--mission-id', rustMissionId, '--cell-id', command.cellId,
    '--idempotency-key', command.idempotencyKey, '--operation', command.operation,
    '--amino-acids', String(command.aminoAcids), '--tick', String(command.tick),
    '--authority-file', authority.reference];
  const run = await runAuthorizedCli({ args, root: cli.studioBridgeRoot(), authority,
    trustJson: process.env.GENOS_CLI_AUTHORITY_TRUST_JSON });
  if (!successfulRun({ run, command, rustMissionId, tenant: req.tenant })) {
    return res.status(502).json({ error: { code: 'METABOLIC_RUST_EXECUTION_FAILED', message: run.stderr?.trim() || run.error || 'Durable metabolic executor failed.' } });
  }
  return res.json({ operation: 'metabolic_pool', missionId: command.missionId,
    idempotencyKey: command.idempotencyKey,
    backendAuthorization: { principalId: req.user?.keyId || req.user?.username || 'authenticated_api_principal',
      permission: 'experiment:run', organizationId: req.tenant.organizationId,
      projectId: req.tenant.projectId, authenticatedByRust: true },
    rust: run.json });
}

async function runAuthorizedCli(input) {
  try {
    return await cli.runGenos(input.args, { root: input.root, envOverrides: {
      GENOS_CLI_AUTHORITY_TRUST_JSON: input.trustJson,
    } });
  } finally {
    await fs.rm(input.authority.path, { force: true });
  }
}

function successfulRun(input) {
  const { run, command, rustMissionId, tenant } = input;
  const identity = run?.json;
  const receipt = identity?.receipt;
  return run?.ok === true && identity?.success === true && Boolean(receipt)
    && operationIdentityMatches({ identity, command, rustMissionId, tenant })
    && operationReceiptMatches({ receipt, command, rustMissionId });
}

function operationIdentityMatches(input) {
  const { identity, command, rustMissionId, tenant } = input;
  return identity.execution_mode === 'backend-authorized'
    && identity.mission_authority === 'authenticated_backend_capability'
    && authorityScopeMatches(identity.authority_scope, tenant, command.missionId)
    && operationIdentityMatchesCommand(identity, command, rustMissionId);
}

function authorityScopeMatches(scope, tenant, missionId) {
  return scope?.organization_id === tenant.organizationId
    && scope?.project_id === tenant.projectId && scope?.mission_id === missionId;
}

function operationIdentityMatchesCommand(identity, command, rustMissionId) {
  return identity.mission_id === rustMissionId && identity.cell_id === command.cellId
    && identity.idempotency_key === command.idempotencyKey && identity.operation === command.operation
    && identity.amino_acids === command.aminoAcids && identity.tick === command.tick;
}

function operationReceiptMatches(input) {
  const { receipt, command, rustMissionId } = input;
  return receipt.mission_id === rustMissionId && receipt.cell_id === command.cellId
    && receipt.operation === command.operation
    && receipt.requested_amino_acids === command.aminoAcids
    && receipt.tick === command.tick && receipt.idempotency_key === command.idempotencyKey;
}

module.exports = { consume };
