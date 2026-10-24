'use strict';

const { randomUUID } = require('node:crypto');
const { withTransaction } = require('../../../db');

async function persistUpgradeCandidate(input) {
  const candidateId = randomUUID();
  let output;
  await withTransaction(input.db, async (tx) => {
    await assertProject(tx, input.organizationId, input.projectId);
    const current = await currentInstallation(tx, input);
    assertCurrentRevision(current, input.expectedRevision);
    const currentLockfile = JSON.parse(current.lockfile_json);
    if (currentLockfile.graphDigest !== input.plan.sourceGraphDigest) throw revisionConflict();
    output = await insertCandidate(tx, { ...input, candidateId });
  });
  return output;
}

async function currentInstallation(db, input) {
  const row = await db.get(`SELECT lockfile_json, revision FROM gci_installations
    WHERE organization_id = ? AND project_id = ? AND environment = ? AND status = 'active'`,
  [input.organizationId, input.projectId, input.environment]);
  if (!row) throw gciError('GCI_INSTALLATION_INACTIVE', 'An active installation is required to plan an upgrade');
  return row;
}

function assertCurrentRevision(row, expectedRevision) {
  if (row.revision !== expectedRevision) throw revisionConflict();
}

async function insertCandidate(db, input) {
  const existing = await db.get(`SELECT id, plan_json, status FROM gci_upgrade_candidates
    WHERE organization_id = ? AND project_id = ? AND environment = ?
      AND source_graph_digest = ? AND candidate_graph_digest = ?`,
  [input.organizationId, input.projectId, input.environment,
    input.plan.sourceGraphDigest, input.plan.candidateGraphDigest]);
  if (existing) return candidateResult(existing);
  await db.run(`INSERT INTO gci_upgrade_candidates
    (id, organization_id, project_id, environment, source_graph_digest,
     candidate_graph_digest, plan_json, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  [input.candidateId, input.organizationId, input.projectId, input.environment,
    input.plan.sourceGraphDigest, input.plan.candidateGraphDigest, JSON.stringify(input.plan), input.plan.status]);
  await db.run(`INSERT INTO gci_event_ledger
    (id, organization_id, project_id, event_type, event_json) VALUES (?, ?, ?, ?, ?)`,
  [randomUUID(), input.organizationId, input.projectId,
    input.plan.status === 'no_change' ? 'upgrade_no_change' : 'upgrade_candidate_resolved',
    JSON.stringify({ candidateId: input.candidateId, sourceGraphDigest: input.plan.sourceGraphDigest,
      candidateGraphDigest: input.plan.candidateGraphDigest, changes: input.plan.changes })]);
  return { candidateId: input.candidateId, status: input.plan.status, plan: input.plan };
}

function candidateResult(row) {
  return { candidateId: row.id, status: row.status, plan: JSON.parse(row.plan_json), idempotent: true };
}

async function assertProject(db, organizationId, projectId) {
  const row = await db.get("SELECT id FROM projects WHERE id = ? AND organization_id = ? AND status = 'active'",
    [projectId, organizationId]);
  if (!row) throw gciError('GCI_PROJECT_SCOPE_DENIED', 'GCI project is missing or outside the organization');
}

function revisionConflict() {
  return gciError('GCI_REVISION_CONFLICT', 'GCI installation revision conflict');
}

function gciError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = { persistUpgradeCandidate };
