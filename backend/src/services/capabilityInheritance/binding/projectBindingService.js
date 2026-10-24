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

module.exports = { bindProject, saveInstallation };
