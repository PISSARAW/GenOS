'use strict';

const { getDatabase } = require('../db');
const { missionBelongsToTenant } = require('./biologicalReceiptController');
const { ingestSyntheticSensoryReceipt, claimSyntheticSensoryPafDispatch,
  completeSyntheticSensoryPafDispatch, releaseSyntheticSensoryPafDispatch } = require('../services/syntheticSensoryIngestionService');
const { createSensoryAuthorityFile } = require('../services/syntheticSensoryBackendAuthority');
const cli = require('../services/genosCli');
const fs = require('node:fs/promises');

const CLIENT_CODES = new Set([
  'SENSORY_ENVELOPE_INVALID', 'SENSORY_ENVELOPE_TOO_LARGE', 'SENSORY_SIGNAL_INVALID',
  'SENSORY_PRODUCER_TRUST_INVALID', 'SENSORY_PRODUCER_UNTRUSTED',
  'SENSORY_PRODUCER_SIGNATURE_INVALID', 'SENSORY_MISSION_NOT_FOUND',
  'SENSORY_TICK_CONFLICT', 'SENSORY_TICK_STALE'
]);

async function ingest(req, res, next) {
  try {
    const missionId = req.params.missionId;
    const db = await getDatabase();
    if (!await missionBelongsToTenant(db, missionId, req.tenant)) {
      return res.status(404).json({ error: { code: 'MISSION_NOT_FOUND', message: 'Mission is not available in this project.' } });
    }
    const result = await ingestSyntheticSensoryReceipt({ db, missionId, input: req.body, trustJson: process.env.GENOS_SENSORY_TRUST_JSON });
    const imported = await importAndConsume({ db, req, missionId, result });
    if (!imported) return res.status(502).json({ error: { code: 'SENSORY_RUST_IMPORT_FAILED', message: 'The authenticated receipt remains persisted for retry, but Rust did not confirm PAF consumption.' } });
    return res.status(result.duplicate ? 200 : 201).json({ ...result, rust: imported });
  } catch (error) {
    if (error.code === 'SENSORY_PRODUCER_TRUST_UNAVAILABLE') {
      return res.status(503).json({ error: { code: error.code, message: 'Sensory producer trust is not configured.' } });
    }
    if (CLIENT_CODES.has(error.code)) {
      const status = error.code === 'SENSORY_TICK_CONFLICT' || error.code === 'SENSORY_TICK_STALE' ? 409 : 400;
      return res.status(status).json({ error: { code: error.code, message: error.message } });
    }
    if (error.code === 'SENSORY_PAF_CLAIM_BUSY') {
      return res.status(503).json({ error: { code: error.code, message: 'A PAF dispatch for this sensory tick is already in progress.' } });
    }
    return next(error);
  }
}

async function importAndConsume({ db, req, missionId, result }) {
  const row = await db.get(`SELECT stimulus_sha256, signature_hex, trust_key_sha256, signal_json
    FROM synthetic_sensory_receipts WHERE mission_id=? AND producer_id=? AND tick=?`,
  missionId.toLowerCase(), result.producerId, result.tick);
  const mission = await db.get('SELECT objective FROM missions WHERE mission_id=?', missionId.toLowerCase());
  if (!row || !mission) return null;
  const dispatch = await claimSyntheticSensoryPafDispatch(db, { missionId: missionId.toLowerCase(),
    producerId: result.producerId, tick: result.tick, payloadHash: result.payloadHash });
  if (dispatch.state === 'complete') return dispatch.rust;
  if (dispatch.state !== 'reserved') throw Object.assign(new Error('Sensory PAF dispatch claim is invalid.'), { code: 'SENSORY_PAF_CLAIM_BUSY' });
  try {
    return await executeClaimedDispatch({ db, req, missionId, mission, row, result, dispatch });
  } catch (error) {
    await releaseSyntheticSensoryPafDispatch(db, { missionId: missionId.toLowerCase(),
      producerId: result.producerId, tick: result.tick, payloadHash: result.payloadHash, leaseToken: dispatch.leaseToken });
    throw error;
  }
}

async function executeClaimedDispatch(input) {
  const { db, req, missionId, mission, row, result, dispatch } = input;
  const root = cli.studioBridgeRoot();
  const authority = await createSensoryAuthorityFile({ root, tenant: req.tenant,
    principalId: principalId(req), receipt: { ...result, stimulusSha256: row.stimulus_sha256,
      signatureHex: row.signature_hex,
      trustKeySha256: row.trust_key_sha256, signalJson: row.signal_json } });
  try {
    const imported = await cli.runGenos(['sensory-backend-import', '--authority-file', authority.reference], {
      root, envOverrides: { GENOS_CLI_AUTHORITY_TRUST_JSON: process.env.GENOS_CLI_AUTHORITY_TRUST_JSON,
        GENOS_SENSORY_TRUST_JSON: process.env.GENOS_SENSORY_TRUST_JSON },
    });
    if (!validImportedReceipt({ run: imported, missionId, tenant: req.tenant, row })) {
      await releaseSyntheticSensoryPafDispatch(db, claimInput(result, missionId, dispatch));
      return null;
    }
    const rust = await runPafTick({ root, missionId, objective: mission.objective, imported, env: {
      GENOS_CLI_AUTHORITY_TRUST_JSON: process.env.GENOS_CLI_AUTHORITY_TRUST_JSON,
      GENOS_SENSORY_TRUST_JSON: process.env.GENOS_SENSORY_TRUST_JSON,
    } });
    if (!rust) {
      await releaseSyntheticSensoryPafDispatch(db, claimInput(result, missionId, dispatch));
      return null;
    }
    await completeSyntheticSensoryPafDispatch(db, { missionId: missionId.toLowerCase(),
      producerId: result.producerId, tick: result.tick, payloadHash: result.payloadHash,
      leaseToken: dispatch.leaseToken, sourceDigest: rust.import.receipt.source_digest,
      pafReceipt: rust, rustTick: rust.tick.tick });
    return rust;
  } finally { await fs.rm(authority.path, { force: true }); }
}

function claimInput(result, missionId, dispatch) {
  return { missionId: missionId.toLowerCase(), producerId: result.producerId, tick: result.tick,
    payloadHash: result.payloadHash, leaseToken: dispatch.leaseToken };
}

function principalId(req) {
  const identity = req.user?.keyId || req.user?.username || req.user?.id;
  if (typeof identity !== 'string' || !identity.trim() || identity.length > 256) {
    throw Object.assign(new Error('Authenticated API principal identity is unavailable.'), { code: 'SENSORY_BACKEND_AUTHORITY_UNAVAILABLE' });
  }
  return identity;
}

function validImportedReceipt({ run, missionId, tenant, row }) {
  const receipt = run?.json?.receipt;
  return run?.ok === true && run.json.execution_mode === 'backend-authorized'
    && run.json.mission_authority === 'authenticated_backend_capability'
    && run.json.authority_scope?.organization_id === tenant.organizationId
    && run.json.authority_scope?.project_id === tenant.projectId
    && run.json.authority_scope?.mission_id === missionId
    && receipt?.source_receipt?.stimulus_sha256 === row.stimulus_sha256;
}

async function runPafTick(input) {
  const run = await cli.runGenos(['biological', '--tick', '--mission-id', input.missionId, '--mission', input.objective], {
    root: input.root, envOverrides: input.env,
  });
  const receipts = run?.json?.receipts;
  if (run?.ok !== true || !Array.isArray(receipts)) return null;
  const paf = receipts.find(receipt => receipt?.schema === 'genos.instinct-paf-receipt/v1');
  const importedDigest = input.imported.json.receipt?.source_digest;
  if (!importedDigest || !paf || !Array.isArray(paf.sensory_source_refs)
    || !paf.sensory_source_refs.some(source => source?.source_digest === importedDigest)) return null;
  return { import: input.imported.json, tick: run.json, paf };
}

module.exports = { ingest };
