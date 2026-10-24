'use strict';

const { createHash, randomUUID } = require('node:crypto');

async function bindProject({ db, organizationId, projectId, providerId, manifest, expectedRevision = 0 }) {
  requireScope({ organizationId, projectId, providerId });
  const serialized = JSON.stringify(manifest);
  const digest = `sha256:${createHash('sha256').update(serialized).digest('hex')}`;
  await require('../../../db').withTransaction(db, async (tx) => {
    await assertProjectScope(tx, organizationId, projectId);
    const current = await tx.get(`SELECT revision FROM gci_project_bindings
      WHERE organization_id = ? AND project_id = ? AND provider_id = ?`, [organizationId, projectId, providerId]);
    if ((current ? current.revision : 0) !== expectedRevision) throw conflictError();
    await tx.run(`INSERT INTO gci_project_bindings
      (id, organization_id, project_id, provider_id, manifest_digest)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(organization_id, project_id, provider_id) DO UPDATE SET
      manifest_digest = excluded.manifest_digest, revision = excluded.revision,
      updated_at = CURRENT_TIMESTAMP`, [randomUUID(), organizationId, projectId, providerId, digest]);
    await recordEvent(tx, { organizationId, projectId, eventType: 'project_bound', payload: { providerId, manifestDigest: digest } });
  });
  return { projectId, providerId, manifestDigest: digest, revision: expectedRevision + 1 };
}

async function saveInstallation({ db, organizationId, lockfile, expectedRevision = 0 }) {
  if (!organizationId || !lockfile || !lockfile.projectId) throw new Error('GCI installation scope is required');
  const revision = expectedRevision + 1;
  await require('../../../db').withTransaction(db, async (tx) => {
    await assertProjectScope(tx, organizationId, lockfile.projectId);
    const row = await tx.get(`SELECT revision FROM gci_installations WHERE organization_id = ? AND project_id = ? AND environment = ?`,
      [organizationId, lockfile.projectId, lockfile.environment]);
    if ((row ? row.revision : 0) !== expectedRevision) throw conflictError();
    await tx.run(`INSERT INTO gci_installations
      (id, organization_id, project_id, environment, lockfile_json, revision)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(organization_id, project_id, environment) DO UPDATE SET
      lockfile_json = excluded.lockfile_json, revision = excluded.revision,
      status = 'active', updated_at = CURRENT_TIMESTAMP`,
    [randomUUID(), organizationId, lockfile.projectId, lockfile.environment, JSON.stringify(lockfile), revision]);
    await recordEvent(tx, { organizationId, projectId: lockfile.projectId, eventType: 'installation_resolved', payload: { graphDigest: lockfile.graphDigest, revision } });
  });
  return { revision, graphDigest: lockfile.graphDigest };
}

async function adoptProject(input) {
  const { db, organizationId, projectId, manifest, lockfile } = input;
  const providerId = manifest.provider.id;
  const serializedManifest = JSON.stringify(manifest);
  const manifestDigest = `sha256:${createHash('sha256').update(serializedManifest).digest('hex')}`;
  const bindingRevision = input.expectedBindingRevision || 0;
  const installRevision = input.expectedInstallationRevision || 0;
  const nextInstallRevision = installRevision + 1;
  await require('../../../db').withTransaction(db, async (tx) => {
    await assertProjectScope(tx, organizationId, projectId);
    await assertBindingRevision(tx, { organizationId, projectId, providerId, expectedRevision: bindingRevision });
    await assertInstallationRevision(tx, { organizationId, projectId, environment: lockfile.environment, expectedRevision: installRevision });
    await assertNoRevokedCapabilities(tx, { organizationId, projectId, lockfile });
    await writeBinding(tx, { organizationId, projectId, providerId, manifestDigest, revision: bindingRevision + 1 });
    await writeInstallation(tx, { organizationId, projectId, lockfile, revision: nextInstallRevision });
    await recordEvent(tx, { organizationId, projectId, eventType: 'project_adopted', payload: {
      providerId, manifestDigest, graphDigest: lockfile.graphDigest, revision: nextInstallRevision
    } });
  });
  return { projectId, providerId, manifestDigest, revision: nextInstallRevision, graphDigest: lockfile.graphDigest };
}

async function assertNoRevokedCapabilities(db, scope) {
  for (const capability of scope.lockfile.capabilities) {
    const revoked = await db.get(`SELECT 1 FROM gci_project_revocations
      WHERE organization_id = ? AND project_id = ? AND capability_id = ? AND version = ?`,
    [scope.organizationId, scope.projectId, capability.capabilityId, capability.version]);
    if (revoked) throw Object.assign(new Error('A revoked capability cannot be adopted again at the same version'), { code: 'GCI_CAPABILITY_REVOKED' });
  }
}

async function revokeProjectCapability(input) {
  const { db, organizationId, projectId, environment, capabilityId, version, reason, revokedBy, expectedRevision } = input;
  await require('../../../db').withTransaction(db, async (tx) => {
    await assertProjectScope(tx, organizationId, projectId);
    const row = await tx.get(`SELECT lockfile_json, revision FROM gci_installations
      WHERE organization_id = ? AND project_id = ? AND environment = ? AND status = 'active'`,
    [organizationId, projectId, environment]);
    if (!row || row.revision !== expectedRevision) throw conflictError();
    const lockfile = JSON.parse(row.lockfile_json);
    if (!lockfile.capabilities.some((entry) => entry.capabilityId === capabilityId && entry.version === version)) {
      throw Object.assign(new Error('Capability is not installed for this project'), { code: 'GCI_CAPABILITY_NOT_INSTALLED' });
    }
    const revocation = await tx.run(`INSERT OR IGNORE INTO gci_project_revocations
      (organization_id, project_id, capability_id, version, reason, revoked_by)
      VALUES (?, ?, ?, ?, ?, ?)`, [organizationId, projectId, capabilityId, version, reason, revokedBy]);
    if (revocation.changes !== 1) throw Object.assign(new Error('Capability is already revoked for this project'), { code: 'GCI_CAPABILITY_ALREADY_REVOKED' });
    const updated = await tx.run(`UPDATE gci_installations SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP
      WHERE organization_id = ? AND project_id = ? AND environment = ? AND revision = ?`,
    [organizationId, projectId, environment, expectedRevision]);
    if (updated.changes !== 1) throw conflictError();
    await recordEvent(tx, { organizationId, projectId, eventType: 'capability_revoked', payload: { capabilityId, version, reason, revokedBy } });
  });
  return { projectId, capabilityId, version, revoked: true };
}

async function projectStatus(input) {
  const { db, organizationId, projectId } = input;
  await assertProjectScope(db, organizationId, projectId);
  const [bindings, installations, revocations] = await Promise.all([
    db.all(`SELECT provider_id AS providerId, manifest_digest AS manifestDigest, revision, created_at AS createdAt
      FROM gci_project_bindings WHERE organization_id = ? AND project_id = ? ORDER BY provider_id`, [organizationId, projectId]),
    db.all(`SELECT environment, lockfile_json AS lockfileJson, revision, status, updated_at AS updatedAt
      FROM gci_installations WHERE organization_id = ? AND project_id = ? ORDER BY environment`, [organizationId, projectId]),
    db.all(`SELECT capability_id AS capabilityId, version, reason, revoked_by AS revokedBy, created_at AS createdAt
      FROM gci_project_revocations WHERE organization_id = ? AND project_id = ? ORDER BY capability_id, version`, [organizationId, projectId])
  ]);
  return { projectId, bindings, installations: installations.map(parseInstallation), revocations };
}

function parseInstallation(row) {
  return { ...row, lockfile: JSON.parse(row.lockfileJson), lockfileJson: undefined };
}

async function assertBindingRevision(db, input) {
  const row = await db.get(`SELECT revision FROM gci_project_bindings
    WHERE organization_id = ? AND project_id = ? AND provider_id = ?`, [input.organizationId, input.projectId, input.providerId]);
  if ((row ? row.revision : 0) !== input.expectedRevision) throw conflictError();
}

async function assertInstallationRevision(db, input) {
  const row = await db.get(`SELECT revision FROM gci_installations
    WHERE organization_id = ? AND project_id = ? AND environment = ?`, [input.organizationId, input.projectId, input.environment]);
  if ((row ? row.revision : 0) !== input.expectedRevision) throw conflictError();
}

async function writeBinding(db, input) {
  await db.run(`INSERT INTO gci_project_bindings
    (id, organization_id, project_id, provider_id, manifest_digest, revision)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, project_id, provider_id) DO UPDATE SET
    manifest_digest = excluded.manifest_digest, revision = excluded.revision, updated_at = CURRENT_TIMESTAMP`,
  [randomUUID(), input.organizationId, input.projectId, input.providerId, input.manifestDigest, input.revision]);
}

async function writeInstallation(db, input) {
  await db.run(`INSERT INTO gci_installations
    (id, organization_id, project_id, environment, lockfile_json, revision)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(organization_id, project_id, environment) DO UPDATE SET
    lockfile_json = excluded.lockfile_json, revision = excluded.revision,
    status = 'active', updated_at = CURRENT_TIMESTAMP`,
  [randomUUID(), input.organizationId, input.projectId, input.lockfile.environment, JSON.stringify(input.lockfile), input.revision]);
}

async function assertProjectScope(db, organizationId, projectId) {
  const project = await db.get('SELECT id FROM projects WHERE id = ? AND organization_id = ? AND status = \'active\'', [projectId, organizationId]);
  if (!project) throw Object.assign(new Error('GCI project is missing or outside the organization'), { code: 'GCI_PROJECT_SCOPE_DENIED' });
}

async function recordEvent(db, event) {
  await db.run('INSERT INTO gci_event_ledger (id, organization_id, project_id, event_type, event_json) VALUES (?, ?, ?, ?, ?)',
    [randomUUID(), event.organizationId, event.projectId, event.eventType, JSON.stringify(event.payload)]);
}

function requireScope(scope) {
  if (!scope.organizationId || !scope.projectId || !scope.providerId) throw new Error('GCI binding requires tenant, project, and provider scope');
}

function conflictError() {
  const error = new Error('GCI state revision conflict');
  error.code = 'GCI_REVISION_CONFLICT';
  return error;
}

module.exports = { bindProject, saveInstallation, adoptProject, revokeProjectCapability, projectStatus };
