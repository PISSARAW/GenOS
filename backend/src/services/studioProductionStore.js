'use strict';
const crypto = require('node:crypto');
const { failure } = require('./studioWorldsService');
const input = require('./studioSpecialistInput');
const { withTransaction } = require('../db');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');

async function workflow(db, context) {
  const id = input.text(context.workflowId || context.body.workflowId, 200);
  const row = await db.get(`SELECT w.* FROM workflows w JOIN workspaces ws ON ws.id = w.workspace_id
    WHERE w.id = ? AND w.organization_id = ? AND w.project_id = ?
      AND ws.organization_id = w.organization_id AND ws.project_id = w.project_id`,
  id, context.scope.organizationId, context.scope.projectId);
  if (!row) throw failure('WORKFLOW_NOT_FOUND', 404);
  return row;
}

function material(version) {
  return { graph: JSON.parse(version.graph_json), metadata: JSON.parse(version.metadata_json) };
}

async function verify(db, row) {
  if (digest(row.payload_json) !== row.payload_hash) throw failure('RELEASE_INTEGRITY_FAILED', 409);
  const payload = JSON.parse(row.payload_json);
  const version = await db.get('SELECT * FROM workflow_versions WHERE workflow_id = ? AND version = ?', row.workflow_id, row.version);
  if (!version || digest(JSON.stringify(material(version))) !== digest(JSON.stringify({ graph: payload.graph, metadata: payload.metadata }))) {
    throw failure('RELEASE_SOURCE_CHANGED', 409);
  }
  if (payload.workflowId !== row.workflow_id || payload.version !== row.version) throw failure('RELEASE_INTEGRITY_FAILED', 409);
  return payload;
}

async function release(db, context) {
  const id = input.text(context.releaseId || context.body.releaseId, 200);
  const row = await db.get(`SELECT r.*, m.payload_json, m.payload_hash, m.created_by FROM releases r
    JOIN studio_release_manifests m ON m.release_id = r.id WHERE r.id = ? AND r.organization_id = ? AND r.project_id = ?`,
  id, context.scope.organizationId, context.scope.projectId);
  if (!row) throw failure('RELEASE_NOT_FOUND', 404);
  await workflow(db, { ...context, workflowId: row.workflow_id });
  return { row, payload: await verify(db, row) };
}

function projection(row) {
  return { releaseId: row.id, workflowId: row.workflow_id, version: row.version, releaseHash: row.payload_hash,
    createdBy: row.created_by, metadataStatus: row.status, adapter: 'local_workflow_queue',
    deploymentObserved: false, promotionGranted: false, truthValidated: false };
}

async function list(db, context) {
  return { workflows: await db.all(`SELECT w.id, w.name, w.version, w.status FROM workflows w
    JOIN workspaces ws ON ws.id = w.workspace_id WHERE w.organization_id = ? AND w.project_id = ?
    AND ws.organization_id = w.organization_id AND ws.project_id = w.project_id ORDER BY w.id LIMIT 100`,
  context.scope.organizationId, context.scope.projectId), limit: 100, adapter: 'local_workflow_queue' };
}

async function freeze(db, context) {
  return withTransaction(db, async () => {
    const current = await workflow(db, context);
    if (!['staging', 'published'].includes(current.status)) throw failure('WORKFLOW_NOT_RUNNABLE', 409);
    const versionNumber = input.number(context.body.version, [1, 1000000000]);
    if (!Number.isInteger(versionNumber)) throw failure('RELEASE_VERSION_INVALID', 400);
    const version = await db.get('SELECT * FROM workflow_versions WHERE workflow_id = ? AND version = ?', current.id, versionNumber);
    if (!version) throw failure('WORKFLOW_VERSION_NOT_FOUND', 404);
    const existing = await db.get(`SELECT r.id FROM releases r JOIN studio_release_manifests m ON m.release_id = r.id
      WHERE r.workflow_id = ? AND r.version = ?`, current.id, versionNumber);
    if (existing) throw failure('RELEASE_ALREADY_FROZEN', 409);
    const content = material(version);
    if (!require('../controllers/validation/graphValidation').validateGraph(content.graph).valid) throw failure('INVALID_GRAPH', 400);
    const payload = JSON.stringify({ workflowId: current.id, version: versionNumber, ...content });
    if (Buffer.byteLength(payload) > 2 * 1024 * 1024) throw failure('RELEASE_TOO_LARGE', 413);
    const id = 'rel-' + crypto.randomUUID();
    await db.run(`INSERT INTO releases(id,workflow_id,version,environment,traffic,status,organization_id,project_id)
      VALUES(?,?,?,'staging',0,'pending',?,?)`, id, current.id, versionNumber, context.scope.organizationId, context.scope.projectId);
    await db.run('INSERT INTO studio_release_manifests(release_id,payload_json,payload_hash,created_by) VALUES(?,?,?,?)',
      id, payload, digest(payload), context.actor);
    return inspect(db, { ...context, releaseId: id });
  });
}

async function inspect(db, context) {
  const { row, payload } = await release(db, context);
  return { ...projection(row), payload, integrityChecked: true };
}

module.exports = { digest, workflow, release, verify, projection, list, freeze, inspect };
