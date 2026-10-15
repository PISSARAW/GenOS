'use strict';

const { migrateHabitatRevisions } = require('../db/migrations/migrateHabitatRevisions');
const { digest, encode } = require('./biologicalIntegrity');

const RUNTIMES = new Set(['process', 'container', 'microvm', 'kubernetes', 'external', 'self_hosted']);
const IMAGE_RUNTIMES = new Set(['container', 'microvm', 'kubernetes']);
const NETWORKS = new Set(['none', 'limited', 'unrestricted', 'host']);
const ASSURANCE = new Set(['enforced', 'declared', 'unavailable']);
const LIMITS = ['cpuSeconds', 'memoryMb', 'pidCount', 'diskMb', 'wallClockMs', 'outputBytes'];

function habitatError(code, message = code) {
  return Object.assign(new Error(message), { code });
}

function nonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateLimits(limits = {}) {
  for (const key of LIMITS) {
    const value = limits[key];
    if (value !== undefined && value !== null && (!Number.isFinite(value) || value <= 0)) {
      throw habitatError('HABITAT_LIMIT_INVALID', `${key} must be a positive finite number or null.`);
    }
  }
}

function validateAssurance(assertions = {}) {
  for (const [boundary, assurance] of Object.entries(assertions)) {
    if (!nonBlank(boundary) || !ASSURANCE.has(assurance)) {
      throw habitatError('HABITAT_ASSURANCE_INVALID', 'Isolation assertions must use enforced, declared or unavailable.');
    }
  }
}

function validateConfiguration(configuration) {
  if (!configuration || !RUNTIMES.has(configuration.runtimeKind)) {
    throw habitatError('HABITAT_RUNTIME_INVALID', `runtimeKind must be one of: ${[...RUNTIMES].join(', ')}.`);
  }
  validateNetworkPolicy(configuration.networkPolicy || {});
  validateImage(configuration);
  validateLimits(configuration.limits);
  validateAssurance(configuration.isolationAssertions);
  return configuration;
}

function validateNetworkPolicy(network) {
  if (!NETWORKS.has(network.type)) throw habitatError('HABITAT_NETWORK_INVALID');
  if (network.type === 'limited' && !Array.isArray(network.allowedHosts)) {
    throw habitatError('HABITAT_NETWORK_INVALID', 'limited networking requires allowedHosts.');
  }
}

function validateImage(configuration) {
  if (configuration.imageDigest !== null && configuration.imageDigest !== undefined
      && !/^sha256:[a-f0-9]{64}$/i.test(configuration.imageDigest)) {
    throw habitatError('HABITAT_IMAGE_DIGEST_INVALID');
  }
  if (IMAGE_RUNTIMES.has(configuration.runtimeKind) && !configuration.imageDigest) {
    throw habitatError('HABITAT_IMAGE_DIGEST_REQUIRED');
  }
}

function tenant(input = {}) {
  return { organizationId: input.organizationId || null, projectId: input.projectId || null };
}

function sameTenant(row, scope) {
  return (row.organization_id || null) === scope.organizationId
    && (row.project_id || null) === scope.projectId;
}

async function head(db, input) {
  await migrateHabitatRevisions(db);
  return db.get(`SELECT * FROM habitat_revisions
    WHERE habitat_id = ? ORDER BY revision DESC LIMIT 1`, input.habitatId);
}

function verifiedRevision(row) {
  if (!row) return null;
  const configuration = JSON.parse(row.configuration_json);
  if (digest(configuration) !== row.content_hash) throw habitatError('HABITAT_INTEGRITY_MISMATCH');
  return { habitatId: row.habitat_id, revision: row.revision, previousHash: row.previous_hash,
    contentHash: row.content_hash, configuration, tenant: tenant({ organizationId: row.organization_id,
      projectId: row.project_id }), createdAt: row.created_at };
}

function assertExpectedRevision(input, currentRevision) {
  if (input.expectedRevision !== undefined && input.expectedRevision !== currentRevision) {
    throw habitatError('HABITAT_REVISION_CONFLICT');
  }
}

async function insertRevision(db, record) {
  try {
    await db.run(`INSERT INTO habitat_revisions
      (habitat_id, revision, previous_hash, content_hash, configuration_json, organization_id, project_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, record.habitatId, record.revision, record.previousHash,
    record.contentHash, encode(record.configuration), record.scope.organizationId, record.scope.projectId);
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw habitatError('HABITAT_REVISION_CONFLICT');
    throw error;
  }
}

async function registerRevision(db, input) {
  if (!nonBlank(input?.habitatId)) throw habitatError('HABITAT_ID_REQUIRED');
  const configuration = validateConfiguration(input.configuration);
  const current = await head(db, input);
  const currentRevision = current?.revision || 0;
  assertExpectedRevision(input, currentRevision);
  const scope = tenant(input);
  if (current && !sameTenant(current, scope)) throw habitatError('HABITAT_TENANT_MISMATCH');
  const contentHash = digest(configuration);
  if (current?.content_hash === contentHash) return verifiedRevision(current);
  const revision = currentRevision + 1;
  await insertRevision(db, { habitatId: input.habitatId, revision, previousHash: current?.content_hash || null,
    contentHash, configuration, scope });
  return verifiedRevision(await db.get('SELECT * FROM habitat_revisions WHERE habitat_id = ? AND revision = ?', input.habitatId, revision));
}

async function getRevision(db, input) {
  await migrateHabitatRevisions(db);
  const row = await db.get('SELECT * FROM habitat_revisions WHERE habitat_id = ? AND revision = ?', input.habitatId, input.revision);
  if (!row) return null;
  if (!sameTenant(row, tenant(input))) throw habitatError('HABITAT_TENANT_MISMATCH');
  return verifiedRevision(row);
}

async function bindMission(db, input) {
  if (!nonBlank(input?.missionId)) throw habitatError('MISSION_ID_REQUIRED');
  const revision = await getRevision(db, input);
  if (!revision) throw habitatError('HABITAT_REVISION_NOT_FOUND');
  const scope = tenant(input);
  const binding = { missionId: input.missionId, habitatId: input.habitatId,
    habitatRevision: input.revision, habitatHash: revision.contentHash, tenant: scope };
  const bindingHash = digest(binding);
  await db.run(`INSERT INTO mission_habitat_bindings
    (mission_id, habitat_id, habitat_revision, binding_hash, organization_id, project_id)
    VALUES (?, ?, ?, ?, ?, ?)`, input.missionId, input.habitatId, input.revision,
  bindingHash, scope.organizationId, scope.projectId);
  return { ...binding, bindingHash };
}

async function missionBinding(db, input) {
  await migrateHabitatRevisions(db);
  const row = await db.get('SELECT * FROM mission_habitat_bindings WHERE mission_id = ?', input.missionId);
  if (!row) return null;
  const scope = tenant(input);
  if (!sameTenant(row, scope)) throw habitatError('HABITAT_TENANT_MISMATCH');
  const revision = await getRevision(db, { ...input, habitatId: row.habitat_id, revision: row.habitat_revision });
  const binding = { missionId: row.mission_id, habitatId: row.habitat_id,
    habitatRevision: row.habitat_revision, habitatHash: revision.contentHash, tenant: scope };
  if (digest(binding) !== row.binding_hash) throw habitatError('HABITAT_BINDING_INTEGRITY_MISMATCH');
  return { ...binding, bindingHash: row.binding_hash };
}

module.exports = { registerRevision, getRevision, bindMission, missionBinding,
  validateConfiguration, habitatError, RUNTIMES, NETWORKS, ASSURANCE };
