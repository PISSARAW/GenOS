'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../../db');
const { canonicalJson } = require('../aTeam/variants/variantExecutionHelpers');
const migration = require('../../db/migrations/migrateAmbientAgency');

function coded(code, message) {
  return Object.assign(new Error(message), { code });
}

function required(value, code) {
  if (typeof value !== 'string' || !value.trim()) throw coded(code, 'A non-empty value is required.');
  return value;
}

function tenant(input) {
  return {
    organizationId: required(input?.organizationId, 'AMBIENT_ORGANIZATION_REQUIRED'),
    projectId: required(input?.projectId, 'AMBIENT_PROJECT_REQUIRED')
  };
}

function hash(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function validatePolicy(policy) {
  if (!policy || !Array.isArray(policy.allowedApps) || !policy.allowedApps.length) {
    throw coded('AMBIENT_ALLOWED_APPS_REQUIRED', 'At least one allowed app is required.');
  }
  if (!Array.isArray(policy.allowedFields) || !policy.allowedFields.length) {
    throw coded('AMBIENT_ALLOWED_FIELDS_REQUIRED', 'At least one allowed field is required.');
  }
  return { allowedApps: [...new Set(policy.allowedApps)].sort(),
    allowedFields: [...new Set(policy.allowedFields)].sort() };
}

function versionContent(input, version, status) {
  const payload = input.payload || {};
  return {
    responsibilityId: required(payload.responsibilityId, 'AMBIENT_RESPONSIBILITY_REQUIRED'),
    ownerAgentId: required(payload.ownerAgentId, 'AMBIENT_OWNER_REQUIRED'),
    mandateRef: required(payload.mandateRef, 'AMBIENT_MANDATE_REQUIRED'),
    consentRef: required(payload.consentRef, 'AMBIENT_CONSENT_REQUIRED'),
    objectiveRef: required(payload.objectiveRef, 'AMBIENT_OBJECTIVE_REQUIRED'),
    externalTrajectoryRef: required(payload.externalTrajectoryRef, 'AMBIENT_TRAJECTORY_REQUIRED'),
    purpose: required(payload.purpose, 'AMBIENT_PURPOSE_REQUIRED'),
    policy: validatePolicy(payload.policy), version, status,
    revocationRef: status === 'REVOKED'
      ? required(payload.revocationRef, 'AMBIENT_REVOCATION_REQUIRED') : null,
    recordedAt: required(payload.recordedAt, 'AMBIENT_RECORDED_AT_REQUIRED')
  };
}

async function revokeInTransaction(db, input) {
  const scope = tenant(input);
  const id = required(input.payload?.responsibilityId, 'AMBIENT_RESPONSIBILITY_REQUIRED');
  const head = await headRow(db, scope, id);
  if (!head) throw coded('AMBIENT_RESPONSIBILITY_NOT_FOUND', 'Responsibility was not found.');
  if (head.status === 'REVOKED') return parsedVersion(await versionRow(db, scope, id, head.current_version));
  if (input.expectedVersion !== head.current_version) {
    throw coded('AMBIENT_RESPONSIBILITY_VERSION_CONFLICT', 'Responsibility head changed.');
  }
  const previous = parsedVersion(await versionRow(db, scope, id, head.current_version));
  const content = versionContent({ payload: { ...previous, ...input.payload,
    ownerAgentId: previous.ownerAgentId } }, head.current_version + 1, 'REVOKED');
  const contentHash = hash(content);
  await db.run(`INSERT INTO ambient_responsibility_versions
    (organization_id,project_id,responsibility_id,version,previous_hash,content_hash,
     content_json,change_kind) VALUES (?,?,?,?,?,?,?,'REVOKE')`, scope.organizationId,
  scope.projectId, id, content.version, head.current_hash, contentHash, canonicalJson(content));
  const updated = await db.run(`UPDATE ambient_responsibilities SET current_version=?,
    current_hash=?,status='REVOKED',updated_at=CURRENT_TIMESTAMP WHERE organization_id=?
    AND project_id=? AND responsibility_id=? AND current_version=? AND status='ACTIVE'`,
  content.version, contentHash, scope.organizationId, scope.projectId, id, head.current_version);
  if (updated.changes !== 1) throw coded('AMBIENT_RESPONSIBILITY_VERSION_CONFLICT', 'Responsibility head changed.');
  return content;
}

async function ensure(db) {
  await migration.migrateAmbientAgency(db);
}

async function headRow(db, scope, responsibilityId) {
  return db.get(`SELECT * FROM ambient_responsibilities
    WHERE organization_id=? AND project_id=? AND responsibility_id=?`,
  scope.organizationId, scope.projectId, responsibilityId);
}

async function versionRow(db, scope, responsibilityId, version) {
  return db.get(`SELECT * FROM ambient_responsibility_versions
    WHERE organization_id=? AND project_id=? AND responsibility_id=? AND version=?`,
  scope.organizationId, scope.projectId, responsibilityId, version);
}

function parsedVersion(row) {
  if (!row) throw coded('AMBIENT_RESPONSIBILITY_NOT_FOUND', 'Responsibility version was not found.');
  const content = JSON.parse(row.content_json);
  if (hash(content) !== row.content_hash) {
    throw coded('AMBIENT_RESPONSIBILITY_INTEGRITY_FAILED', 'Responsibility version hash mismatch.');
  }
  return content;
}

async function create(db, input) {
  const scope = tenant(input);
  const content = versionContent(input, 1, 'ACTIVE');
  const contentHash = hash(content);
  await ensure(db);
  return withTransaction(db, async () => {
    const existing = await headRow(db, scope, content.responsibilityId);
    if (existing) {
      const stored = await versionRow(db, scope, content.responsibilityId, 1);
      if (stored?.content_hash === contentHash) return { content: parsedVersion(stored), replayed: true };
      throw coded('AMBIENT_RESPONSIBILITY_CONFLICT', 'Responsibility identifier is already bound.');
    }
    await db.run(`INSERT INTO ambient_responsibilities
      (organization_id,project_id,responsibility_id,owner_agent_id,current_version,status,current_hash)
      VALUES (?,?,?,?,1,'ACTIVE',?)`, scope.organizationId, scope.projectId,
    content.responsibilityId, content.ownerAgentId, contentHash);
    await db.run(`INSERT INTO ambient_responsibility_versions
      (organization_id,project_id,responsibility_id,version,previous_hash,content_hash,
       content_json,change_kind) VALUES (?,?,?,1,NULL,?,?,'CREATE')`,
    scope.organizationId, scope.projectId, content.responsibilityId, contentHash,
    canonicalJson(content));
    return { content, replayed: false };
  });
}

async function current(db, input) {
  await ensure(db);
  return currentInTransaction(db, input);
}

async function currentInTransaction(db, input) {
  const scope = tenant(input);
  const responsibilityId = required(input.responsibilityId, 'AMBIENT_RESPONSIBILITY_REQUIRED');
  const head = await headRow(db, scope, responsibilityId);
  if (!head) throw coded('AMBIENT_RESPONSIBILITY_NOT_FOUND', 'Responsibility was not found.');
  const row = await versionRow(db, scope, responsibilityId, head.current_version);
  const content = parsedVersion(row);
  if (row.content_hash !== head.current_hash || content.status !== head.status) {
    throw coded('AMBIENT_RESPONSIBILITY_INTEGRITY_FAILED', 'Responsibility head is inconsistent.');
  }
  return content;
}

async function amend(db, input) {
  const scope = tenant(input);
  await ensure(db);
  return withTransaction(db, async () => {
    const id = required(input.payload?.responsibilityId, 'AMBIENT_RESPONSIBILITY_REQUIRED');
    const head = await headRow(db, scope, id);
    if (!head) throw coded('AMBIENT_RESPONSIBILITY_NOT_FOUND', 'Responsibility was not found.');
    if (head.status !== 'ACTIVE') throw coded('AMBIENT_RESPONSIBILITY_REVOKED', 'Revoked responsibility cannot be amended.');
    const previous = parsedVersion(await versionRow(db, scope, id, head.current_version));
    if (input.expectedVersion !== head.current_version) {
      throw coded('AMBIENT_RESPONSIBILITY_VERSION_CONFLICT', 'Responsibility head changed.');
    }
    const content = versionContent({ payload: { ...previous, ...input.payload,
      ownerAgentId: previous.ownerAgentId } }, head.current_version + 1, 'ACTIVE');
    const contentHash = hash(content);
    await db.run(`INSERT INTO ambient_responsibility_versions
      (organization_id,project_id,responsibility_id,version,previous_hash,content_hash,
       content_json,change_kind) VALUES (?,?,?,?,?,?,?,'AMEND')`, scope.organizationId,
    scope.projectId, id, content.version, head.current_hash, contentHash, canonicalJson(content));
    const updated = await db.run(`UPDATE ambient_responsibilities SET current_version=?,
      current_hash=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND project_id=?
      AND responsibility_id=? AND current_version=? AND status='ACTIVE'`, content.version,
    contentHash, scope.organizationId, scope.projectId, id, head.current_version);
    if (updated.changes !== 1) throw coded('AMBIENT_RESPONSIBILITY_VERSION_CONFLICT', 'Responsibility head changed.');
    return content;
  });
}

async function history(db, input) {
  const scope = tenant(input);
  const id = required(input.responsibilityId, 'AMBIENT_RESPONSIBILITY_REQUIRED');
  await ensure(db);
  const rows = await db.all(`SELECT * FROM ambient_responsibility_versions
    WHERE organization_id=? AND project_id=? AND responsibility_id=? ORDER BY version`,
  scope.organizationId, scope.projectId, id);
  if (!rows.length) throw coded('AMBIENT_RESPONSIBILITY_NOT_FOUND', 'Responsibility was not found.');
  return rows.map(parsedVersion);
}

module.exports = { ensure, create, current, amend, history, hash, tenant, coded,
  versionContent, headRow, versionRow, parsedVersion, revokeInTransaction,
  currentInTransaction };
