'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const protocol = require('./runtimeControlReconnectProtocol');
const { canonicalJson } = require('./aTeam/variants/variantExecutionHelpers');

const LINEAGE_FIELDS = [
  'workerId', 'missionId', 'episodeId', 'threadId', 'organizationId', 'projectId'
];

function failure(code, message) {
  return Object.assign(new Error(message), { code });
}

function digest(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function authorityId(descriptorHash) {
  return `runtime-reconnect-${descriptorHash.slice('sha256:'.length)}`;
}

function material(descriptor) {
  if (!protocol.validDescriptor(descriptor)) throw failure(
    'RUNTIME_RECONNECT_DESCRIPTOR_INVALID', 'Reconnect descriptor is invalid.');
  const json = canonicalJson(descriptor);
  const descriptorHash = digest(json);
  return { id: authorityId(descriptorHash), descriptor, json, descriptorHash };
}

function exactLineage(row, lineage) {
  return row.worker_id === lineage.workerId && row.mission_id === lineage.missionId
    && row.episode_id === lineage.episodeId && row.thread_id === lineage.threadId
    && row.organization_id === lineage.organizationId
    && row.project_id === lineage.projectId;
}

function validStoredMaterial(row, descriptor) {
  return [protocol.validDescriptor(descriptor),
    digest(canonicalJson(descriptor)) === row.descriptor_hash,
    authorityId(row.descriptor_hash) === row.authority_id,
    exactLineage(row, descriptor.lineage),
    row.runtime_instance_id === descriptor.runtimeInstanceId,
    row.backend_key_id === descriptor.backendKeyId,
    Number.isInteger(row.revision), row.revision >= 1,
    ['recoverable', 'revoked'].includes(row.status)].every(Boolean);
}

function decode(row) {
  let descriptor;
  try { descriptor = JSON.parse(row.descriptor_json); }
  catch (_) { throw failure('RUNTIME_RECONNECT_AUTHORITY_INTEGRITY',
    'Reconnect authority descriptor JSON is invalid.'); }
  if (!validStoredMaterial(row, descriptor)) throw failure('RUNTIME_RECONNECT_AUTHORITY_INTEGRITY',
    'Reconnect authority does not match its sealed descriptor.');
  return { id: row.authority_id, revision: row.revision, status: row.status,
    descriptor, expectedLineage: descriptor.lineage,
    ...(row.revocation_reason ? { revocationReason: row.revocation_reason } : {}) };
}

async function activeForWorker(db, workerId) {
  return db.get(`SELECT * FROM runtime_control_reconnect_authorities
    WHERE worker_id = ? AND status = 'recoverable'`, workerId);
}

async function save(db, input) {
  const sealed = material(input?.descriptor);
  return withTransaction(db, async () => {
    const existing = await db.get(`SELECT * FROM runtime_control_reconnect_authorities
      WHERE authority_id = ?`, sealed.id);
    if (existing) {
      const record = decode(existing);
      if (record.status !== 'recoverable') throw failure(
        'RUNTIME_RECONNECT_AUTHORITY_REVOKED', 'Reconnect authority was revoked.');
      return { ...record, idempotent: true };
    }
    const active = await activeForWorker(db, sealed.descriptor.lineage.workerId);
    if (active) throw failure('RUNTIME_RECONNECT_AUTHORITY_CONFLICT',
      'A different reconnect authority already owns this worker.');
    const lineage = sealed.descriptor.lineage;
    await db.run(`INSERT INTO runtime_control_reconnect_authorities (
      authority_id, worker_id, mission_id, episode_id, thread_id,
      organization_id, project_id, runtime_instance_id, backend_key_id,
      descriptor_json, descriptor_hash, status, revision
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recoverable', 1)`,
    sealed.id, lineage.workerId, lineage.missionId, lineage.episodeId,
    lineage.threadId, lineage.organizationId, lineage.projectId,
    sealed.descriptor.runtimeInstanceId, sealed.descriptor.backendKeyId,
    sealed.json, sealed.descriptorHash);
    return { ...decode(await db.get(`SELECT * FROM runtime_control_reconnect_authorities
      WHERE authority_id = ?`, sealed.id)), idempotent: false };
  });
}

function validRevocation(input) {
  const scope = LINEAGE_FIELDS.every(field => typeof input?.lineage?.[field] === 'string'
    && input.lineage[field]);
  return [typeof input?.id === 'string', Boolean(input?.id),
    Number.isInteger(input?.expectedRevision), input?.expectedRevision >= 1,
    typeof input?.reason === 'string', Boolean(input?.reason?.trim()),
    Buffer.byteLength(input?.reason?.trim() || '') <= 1024, scope].every(Boolean);
}

async function revoke(db, input) {
  if (!validRevocation(input)) throw failure('RUNTIME_RECONNECT_REVOCATION_INVALID',
    'Reconnect authority revocation is incomplete.');
  const reason = input.reason.trim();
  return withTransaction(db, async () => {
    const row = await db.get(`SELECT * FROM runtime_control_reconnect_authorities
      WHERE authority_id = ?`, input.id);
    if (!row) throw failure('RUNTIME_RECONNECT_AUTHORITY_NOT_FOUND',
      'Reconnect authority was not found.');
    const record = decode(row);
    if (!protocol.exactLineage(record.expectedLineage, input.lineage)) throw failure(
      'RUNTIME_RECONNECT_AUTHORITY_SCOPE_MISMATCH', 'Reconnect authority scope differs.');
    if (record.status === 'revoked') {
      if (record.revocationReason !== reason) throw failure(
        'RUNTIME_RECONNECT_REVOCATION_CONFLICT', 'Revocation reason differs.');
      return { ...record, idempotent: true };
    }
    if (record.revision !== input.expectedRevision) throw failure(
      'RUNTIME_RECONNECT_REVISION_CONFLICT', 'Reconnect authority revision changed.');
    await db.run(`UPDATE runtime_control_reconnect_authorities
      SET status = 'revoked', revision = revision + 1, revocation_reason = ?,
        revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE authority_id = ? AND status = 'recoverable' AND revision = ?`,
    reason, input.id, input.expectedRevision);
    return { ...decode(await db.get(`SELECT * FROM runtime_control_reconnect_authorities
      WHERE authority_id = ?`, input.id)), idempotent: false };
  });
}

async function list(db) {
  const rows = await db.all(`SELECT * FROM runtime_control_reconnect_authorities
    WHERE status = 'recoverable' ORDER BY created_at, authority_id`);
  return rows.map(decode);
}

function create(db) {
  if (!db || typeof db.get !== 'function' || typeof db.run !== 'function'
    || typeof db.all !== 'function') throw failure('RUNTIME_RECONNECT_STORE_INVALID',
    'SQLite reconnect authority store requires a database connection.');
  return Object.freeze({
    saveReconnectAuthority: input => save(db, input),
    revokeReconnectAuthority: input => revoke(db, input),
    listReconnectAuthorities: () => list(db)
  });
}

module.exports = { create };
