'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { getDatabase } = require('../db');
const { missionBelongsToTenant } = require('./biologicalReceiptController');
const cli = require('../services/genosCli');
const { issueBackendProof } = require('../services/neuroGliaBackendAuthority');

const EVENT_TYPES = new Set([
  'BIOLOGICAL_EXECUTION_RECEIPT', 'EMBODIED_ACTION', 'INSTINCT_ACTION_EXECUTED',
  'INSTINCT_ACTION_REFUSED', 'AUTONOMOUS_REPRODUCTION',
]);
const MAX_PAYLOAD_BYTES = 1_048_576;

async function append(req, res, next) {
  try {
    const input = normalizeInput(req.body);
    if (!input) return res.status(400).json({ error: { code: 'NEURO_GLIA_REQUEST_INVALID', message: 'A mission, supported event, payload, tick, idempotency key, and signed producer proof are required.' } });
    const trustJson = process.env.GENOS_NEURO_GLIA_TRUST_JSON;
    if (!trustJson) return res.status(503).json({ error: { code: 'NEURO_GLIA_TRUST_UNAVAILABLE', message: 'Host producer trust is not configured.' } });
    if (!backendSignerConfigured()) return res.status(503).json({ error: { code: 'NEURO_GLIA_BACKEND_AUTHORITY_UNAVAILABLE', message: 'Backend principal signing authority is not configured.' } });
    const db = await getDatabase();
    if (!await missionBelongsToTenant(db, input.missionId, req.tenant)) {
      return res.status(404).json({ error: { code: 'MISSION_NOT_FOUND', message: 'Mission is not available in this project.' } });
    }
    return await runMissionEvent({ req, res, input, trustJson, db, rustMissionId: await rustMissionFor(db, input.missionId) });
  } catch (error) { return next(error); }
}

async function runMissionEvent({ req, res, input, trustJson, db, rustMissionId }) {
  const root = tenantRoot(req.tenant);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const tempDirectory = await fs.mkdtemp(path.join(root, '.neuro-glia-'));
  const payloadPath = path.join(tempDirectory, 'payload.json');
  const proofPath = path.join(tempDirectory, 'backend-proof.json');
  try {
    await fs.writeFile(payloadPath, JSON.stringify(input.payload), { flag: 'wx', mode: 0o600 });
    const proof = issueBackendProof({ principalId: req.tenant.principalId, organizationId: req.tenant.organizationId,
      projectId: req.tenant.projectId, missionId: rustMissionId, producerId: input.producerId,
      eventId: input.eventId, eventType: input.eventType, tick: input.tick,
      idempotencyKey: input.idempotencyKey, payloadSha256: input.payloadSha256 });
    await fs.writeFile(proofPath, JSON.stringify(proof), { flag: 'wx', mode: 0o600 });
    const run = await cli.runGenos(buildArgs({ input, rustMissionId, payloadPath, proofPath }), {
      root, envOverrides: { GENOS_NEURO_GLIA_TRUST_JSON: trustJson },
    });
    if (!successfulRun({ run, input, rustMissionId, tenant: req.tenant })) {
      return res.status(502).json({ error: { code: 'NEURO_GLIA_RUST_EXECUTION_FAILED', message: run?.stderr?.trim() || run?.error || 'Durable neuro-glia executor failed.' } });
    }
    return res.status(201).json({ missionId: input.missionId, rustMissionId,
      backendAuthorization: { principalId: req.tenant.principalId || principalId(req), permission: 'experiment:run',
        organizationId: req.tenant.organizationId, projectId: req.tenant.projectId,
        proof: run.json.entry.source.backend_authorization },
      rust: run.json });
  } finally { await fs.rm(tempDirectory, { recursive: true, force: true }); }
}

function normalizeInput(body) {
  const missionId = validUuid(body?.missionId);
  const producerId = validUuid(body?.producerId);
  const eventId = validUuid(body?.eventId);
  const eventType = String(body?.eventType || '');
  const idempotencyKey = String(body?.idempotencyKey || '').trim();
  const signatureHex = String(body?.signatureHex || '');
  const payloadSha256 = String(body?.payloadSha256 || '');
  const tick = Number(body?.tick);
  const payload = body?.payload;
  if (!validEventIdentity({ missionId, producerId, eventId, eventType, idempotencyKey, signatureHex, payloadSha256 })) return null;
  if (!validTickAndPayload(tick, payload)) return null;
  return { missionId, producerId, eventId, eventType, idempotencyKey, signatureHex, payloadSha256, tick, payload };
}

function validEventIdentity(input) {
  return Boolean(input.missionId && input.producerId && input.eventId && EVENT_TYPES.has(input.eventType)
    && input.idempotencyKey && input.idempotencyKey.length <= 200 && validSignature(input.signatureHex)
    && /^[0-9a-f]{64}$/i.test(input.payloadSha256));
}

function validTickAndPayload(tick, payload) {
  if (!Number.isSafeInteger(tick) || tick < 0 || payload === null || payload === undefined) return false;
  return Buffer.byteLength(JSON.stringify(payload)) <= MAX_PAYLOAD_BYTES;
}

function validSignature(value) { return /^[0-9a-f]{128}$/i.test(value); }

function validUuid(value) {
  const normalized = String(value || '').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized : null;
}

function tenantRoot(tenant) {
  const part = value => Buffer.from(String(value), 'utf8').toString('base64url');
  return path.join(cli.studioBridgeRoot(), 'tenants', part(tenant.organizationId), part(tenant.projectId));
}

function buildArgs({ input, rustMissionId, payloadPath, proofPath }) {
  return ['neuro-glia-stream', '--experimental', '--mission-id', rustMissionId,
    '--require-backend-authorization',
    '--event-type', input.eventType, '--payload', payloadPath, '--tick', String(input.tick),
    '--idempotency-key', input.idempotencyKey, '--producer-id', input.producerId,
    '--signature-hex', input.signatureHex, '--backend-proof', proofPath];
}

function successfulRun({ run, input, rustMissionId, tenant }) {
  const entry = run?.json?.entry;
  return cliRunSucceeded(run) && eventEntryMatches({ entry, input, rustMissionId })
    && backendProofMatches({ proof: entry.source.backend_authorization, input, rustMissionId, tenant });
}

function cliRunSucceeded(run) {
  return run?.ok === true && run.json?.success === true
    && run.json?.execution_mode === 'experimental';
}

function eventEntryMatches({ entry, input, rustMissionId }) {
  return entry?.schema === 'genos.mission-neuro-glia-event/v1'
    && entry?.mission_id === rustMissionId && entry?.event_type === input.eventType
    && entry?.idempotency_key === input.idempotencyKey && entry?.tick === input.tick
    && entry?.event_id === input.eventId && entry?.source?.producer_id === input.producerId;
}

function backendProofMatches({ proof, input, rustMissionId, tenant }) {
  return backendProofIdentityMatches({ proof, rustMissionId, tenant })
    && backendProofEventMatches({ proof, input })
    && /^[0-9a-f]{128}$/i.test(proof?.signatureHex || '');
}

function backendProofIdentityMatches({ proof, rustMissionId, tenant }) {
  return proof?.schema === 'genos.neuro-glia-backend-authorization/v1'
    && proof?.principalId === tenant?.principalId
    && proof?.organizationId === tenant?.organizationId && proof?.projectId === tenant?.projectId
    && proof?.missionId === rustMissionId;
}

function backendProofEventMatches({ proof, input }) {
  return proof?.producerId === input.producerId && proof?.eventId === input.eventId
    && proof?.eventType === input.eventType && proof?.tick === input.tick
    && proof?.idempotencyKey === input.idempotencyKey && proof?.payloadSha256 === input.payloadSha256;
}

async function rustMissionFor(db, missionId) {
  const runtime = await db.get('SELECT rust_mission_id FROM biological_execution_missions WHERE mission_id=?', missionId);
  return runtime?.rust_mission_id || missionId;
}

function backendSignerConfigured() {
  return Boolean(process.env.GENOS_NEURO_GLIA_BACKEND_AUTHORITY_ID
    && process.env.GENOS_NEURO_GLIA_BACKEND_PRIVATE_KEY_PEM);
}

function principalId(req) { return req.user?.keyId || req.user?.username || 'authenticated_api_principal'; }

module.exports = { append, normalizeInput, successfulRun };
