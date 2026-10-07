'use strict';
const crypto = require('node:crypto');
const { withTransaction } = require('../db');
const { failure } = require('./studioWorldsService');
const input = require('./studioSpecialistInput');
const store = require('./studioProductionStore');

function environment(context) {
  if (!['staging', 'production'].includes(context.environment)) throw failure('ENVIRONMENT_INVALID', 400);
  return context.environment;
}
async function slot(db, context) {
  const workflow = await store.workflow(db, context);
  const env = environment(context);
  const row = await db.get('SELECT * FROM studio_deployment_slots WHERE workflow_id = ? AND environment = ?', workflow.id, env);
  return { workflow, current: row || { workflow_id: workflow.id, environment: env, release_id: null, revision: 0 } };
}
function expected(current, body) {
  if (!Number.isInteger(body.expectedRevision) || body.expectedRevision !== current.revision) throw failure('DEPLOYMENT_REVISION_CONFLICT', 409);
}
async function inspect(db, context) {
  const { current } = await slot(db, context);
  const release = current.release_id ? await store.inspect(db, { ...context, releaseId: current.release_id }) : null;
  return { workflowId: current.workflow_id, environment: current.environment, revision: current.revision,
    releaseId: current.release_id, releaseHash: release?.releaseHash || null, version: release?.version || null,
    localPublished: Boolean(release), adapter: 'local_workflow_queue', deploymentObserved: false,
    endpoint: `/api/studio/production/workflows/${encodeURIComponent(current.workflow_id)}/slots/${current.environment}/invoke`,
    events: await db.all('SELECT * FROM studio_deployment_events WHERE workflow_id = ? AND environment = ? ORDER BY revision DESC LIMIT 100',
      current.workflow_id, current.environment), rollbackScope: 'future_local_admissions_only', externalEffectsReversible: false };
}
async function replace(db, context, spec) {
  const { current } = spec;
  await db.run('INSERT OR IGNORE INTO studio_deployment_slots(workflow_id,environment) VALUES(?,?)', current.workflow_id, current.environment);
  const updated = await db.run('UPDATE studio_deployment_slots SET release_id = ?, revision = revision + 1 WHERE workflow_id = ? AND environment = ? AND revision = ?',
    spec.releaseId, current.workflow_id, current.environment, current.revision);
  if (updated.changes !== 1) throw failure('DEPLOYMENT_REVISION_CONFLICT', 409);
  await db.run(`INSERT INTO studio_deployment_events(id,workflow_id,environment,revision,release_id,previous_release_id,actor,action,note)
    VALUES(?,?,?,?,?,?,?,?,?)`, 'deployment-' + crypto.randomUUID(), current.workflow_id, current.environment, current.revision + 1,
  spec.releaseId, current.release_id, context.actor, spec.action, input.text(context.body.note));
  return inspect(db, context);
}
async function publish(db, context) {
  return withTransaction(db, async () => {
    const { workflow, current } = await slot(db, context);
    expected(current, context.body);
    if (!['staging', 'published'].includes(workflow.status)) throw failure('WORKFLOW_NOT_RUNNABLE', 409);
    const { row } = await store.release(db, context);
    if (row.workflow_id !== workflow.id) throw failure('RELEASE_WORKFLOW_MISMATCH', 409);
    if (row.payload_hash !== context.body.releaseHash) throw failure('RELEASE_HASH_CONFLICT', 409);
    if (current.environment === 'production') await require('./studioProductionReview').requireApproval(db, context);
    return replace(db, context, { current, releaseId: row.id, action: 'publish' });
  });
}
async function rollback(db, context) {
  return withTransaction(db, async () => {
    const { current } = await slot(db, context);
    expected(current, context.body);
    const event = await db.get('SELECT * FROM studio_deployment_events WHERE workflow_id = ? AND environment = ? AND revision = ?',
      current.workflow_id, current.environment, current.revision);
    if (!event) throw failure('DEPLOYMENT_HISTORY_REQUIRED', 409);
    if (event.previous_release_id) await store.release(db, { ...context, releaseId: event.previous_release_id });
    return replace(db, context, { current, releaseId: event.previous_release_id, action: 'rollback' });
  });
}
async function invoke(db, context) {
  return withTransaction(db, async () => {
    const { workflow, current } = await slot(db, context);
    expected(current, context.body);
    if (!current.release_id) throw failure('DEPLOYMENT_UNPUBLISHED', 409);
    if (!['staging', 'published'].includes(workflow.status)) throw failure('WORKFLOW_NOT_RUNNABLE', 409);
    const { row } = await store.release(db, { ...context, releaseId: current.release_id });
    if (context.body.releaseHash !== row.payload_hash) throw failure('RELEASE_HASH_CONFLICT', 409);
    const body = input.object(context.body.input || {});
    const id = 'wfr-studio-' + crypto.randomUUID();
    await db.run(`INSERT INTO workflow_runs(id,workflow_id,workflow_version,organization_id,project_id,status,input_json,max_attempts,timeout_ms)
      VALUES(?,?,?,?,?,'queued',?,1,30000)`, id, workflow.id, row.version, context.scope.organizationId, context.scope.projectId, JSON.stringify(body));
    await db.run('INSERT INTO studio_deployment_invocations(run_id,release_id,release_hash,environment,slot_revision,actor) VALUES(?,?,?,?,?,?)',
      id, row.id, row.payload_hash, current.environment, current.revision, context.actor);
    return { runId: id, releaseId: row.id, releaseHash: row.payload_hash, version: row.version, revision: current.revision,
      environment: current.environment, status: 'queued', executionCompleted: false, truthValidated: false, promotionGranted: false };
  });
}
async function assertExecution(db, run) {
  if (!run.id.startsWith('wfr-studio-')) return;
  const invocation = await db.get('SELECT * FROM studio_deployment_invocations WHERE run_id = ?', run.id);
  if (!invocation) throw failure('INVOCATION_BINDING_MISSING', 409);
  const { row } = await store.release(db, { releaseId: invocation.release_id,
    scope: { organizationId: run.organization_id, projectId: run.project_id }, body: {} });
  if (row.payload_hash !== invocation.release_hash || row.workflow_id !== run.workflow_id || row.version !== run.workflow_version) {
    throw failure('INVOCATION_BINDING_INVALID', 409);
  }
}
module.exports = { inspect, publish, rollback, invoke, assertExecution };
