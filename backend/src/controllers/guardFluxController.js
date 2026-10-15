'use strict';

const fs = require('node:fs/promises');
const { getDatabase } = require('../db');
const { missionBelongsToTenant } = require('./biologicalReceiptController');
const cli = require('../services/genosCli');
const { createAuthorityFile } = require('../services/metabolicCliAuthority');

async function apply(req, res, next) {
  try {
    const input = normalizeInput(req.body);
    if (!input) return res.status(400).json({ error: { code: 'GUARD_FLUX_REQUEST_INVALID', message: 'A mission, registered cell, idempotency key, finite flux, and tick are required.' } });
    const db = await getDatabase();
    if (!await missionBelongsToTenant(db, input.missionId, req.tenant)) {
      return res.status(404).json({ error: { code: 'MISSION_NOT_FOUND', message: 'Mission is not available in this project.' } });
    }
    const context = await missionContext({ db, input });
    if (!context) return res.status(409).json({ error: { code: 'GUARD_FLUX_MISSION_STATE_UNAVAILABLE', message: 'No current durable cell state is registered for this mission.' } });
    if (context.cellTick !== input.tick || context.latestTick !== input.tick) {
      return res.status(409).json({ error: { code: 'GUARD_FLUX_TICK_MISMATCH', message: 'The requested tick is not the current registered mission tick.' } });
    }
    return await executeGuardFlux({ req, res, input, rustMissionId: context.rustMissionId });
  } catch (error) { return next(error); }
}

function normalizeInput(body) {
  const missionId = validUuid(body?.missionId);
  const cellId = validUuid(body?.cellId);
  const idempotencyKey = String(body?.idempotencyKey || '').trim();
  const requestedFlux = Number(body?.requestedFlux);
  const tick = Number(body?.tick);
  if (!missionId || !cellId || !idempotencyKey || idempotencyKey.length > 256) return null;
  if (!Number.isFinite(requestedFlux) || requestedFlux < 0) return null;
  if (!Number.isSafeInteger(tick) || tick < 0) return null;
  return { missionId, cellId, idempotencyKey, requestedFlux, tick };
}

function validUuid(value) {
  const normalized = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized : null;
}

async function missionContext({ db, input }) {
  const runtime = await db.get('SELECT rust_mission_id FROM biological_execution_missions WHERE mission_id=?', input.missionId);
  const cell = await db.get('SELECT tick FROM rust_cell_registry WHERE mission_id=? AND cell_id=?', input.missionId, input.cellId);
  const latest = await db.get('SELECT MAX(tick) AS tick FROM rust_cell_registry WHERE mission_id=?', input.missionId);
  if (!cell || latest?.tick === null || latest?.tick === undefined) return null;
  return { rustMissionId: runtime?.rust_mission_id || input.missionId, cellTick: Number(cell.tick), latestTick: Number(latest.tick) };
}

async function executeGuardFlux({ req, res, input, rustMissionId }) {
  const authority = await createAuthorityFile({ root: cli.studioBridgeRoot(), tenant: req.tenant,
    claims: { mission_id: input.missionId, rust_mission_id: rustMissionId, cell_id: input.cellId,
      operation: 'guard_flux', detail: 'guard_flux', value: String(input.requestedFlux),
      tick: input.tick, idempotency_key: input.idempotencyKey } });
  const args = ['guard-flux', '--mission-id', rustMissionId, '--cell-id', input.cellId, '--tick', String(input.tick),
    '--requested-flux', String(input.requestedFlux), '--idempotency-key', input.idempotencyKey,
    '--authority-file', authority.reference];
  const run = await runAuthorizedCli({ args, root: cli.studioBridgeRoot(), authority,
    trustJson: process.env.GENOS_CLI_AUTHORITY_TRUST_JSON });
  if (!successfulRun({ run, input, rustMissionId, tenant: req.tenant })) {
    return res.status(502).json({ error: { code: 'GUARD_FLUX_RUST_EXECUTION_FAILED', message: run?.stderr?.trim() || run?.error || 'Durable guard-flux executor failed.' } });
  }
  return res.json({ operation: 'guard_flux', missionId: input.missionId, cellId: input.cellId,
    idempotencyKey: input.idempotencyKey,
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

function successfulRun(args) {
  const { run, input, rustMissionId, tenant } = args;
  return run?.ok === true && run.json?.execution_mode === 'backend-authorized'
    && run.json?.mission_authority === 'authenticated_backend_capability'
    && scopeMatches(run.json.authority_scope, tenant, input.missionId)
    && receiptMatches(run.json.receipt, input, rustMissionId);
}

function scopeMatches(scope, tenant, missionId) {
  return scope?.organization_id === tenant.organizationId
    && scope?.project_id === tenant.projectId && scope?.mission_id === missionId;
}

function receiptMatches(receipt, input, rustMissionId) {
  return Boolean(receipt) && receipt.mission_id === rustMissionId
    && receipt.cell_id === input.cellId && receipt.tick === input.tick
    && receipt.requested_flux === input.requestedFlux && receipt.idempotency_key === input.idempotencyKey;
}

module.exports = { apply };
