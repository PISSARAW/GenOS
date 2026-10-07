'use strict';
const store = require('./studioProductionStore');
const input = require('./studioSpecialistInput');
const { failure } = require('./studioWorldsService');
const { withTransaction } = require('../db');

async function runs(db, row) {
  return db.all(`SELECT r.id, r.status, r.workflow_version AS version, r.started_at, r.completed_at,
    i.environment, i.slot_revision AS revision, i.actor, i.release_hash AS releaseHash
    FROM workflow_runs r JOIN studio_deployment_invocations i ON i.run_id = r.id
    WHERE i.release_id = ? AND r.workflow_id = ? AND r.organization_id = ? AND r.project_id = ?
    ORDER BY r.created_at DESC, r.id DESC LIMIT 100`, row.id, row.workflow_id, row.organization_id, row.project_id);
}
async function slotViews(db, row) {
  const slots = await db.all('SELECT environment FROM studio_deployment_slots WHERE workflow_id=?', row.workflow_id);
  return Promise.all(slots.map(async item => {
    const state = await require('./studioProductionDeployment').inspect(db, { workflowId: row.workflow_id, environment: item.environment,
      scope: { organizationId: row.organization_id, projectId: row.project_id }, body: {} });
    return { ...state, name: item.environment, status: state.localPublished ? 'publié' : 'non publié' };
  }));
}
async function inspect(db, context) {
  const { row } = await store.release(db, context);
  const observed = await runs(db, row);
  const counts = await db.all(`SELECT r.status, COUNT(*) AS count FROM workflow_runs r
    JOIN studio_deployment_invocations i ON i.run_id=r.id WHERE i.release_id=? AND r.workflow_id=?
    AND r.organization_id=? AND r.project_id=? GROUP BY r.status`, row.id, row.workflow_id, row.organization_id, row.project_id);
  const production = await db.get(`SELECT COUNT(*) AS count FROM workflow_runs r JOIN studio_deployment_invocations i ON i.run_id=r.id
    WHERE i.release_id=? AND i.environment='production' AND r.status='completed' AND i.release_hash=?
    AND r.organization_id=? AND r.project_id=?`, row.id, row.payload_hash, row.organization_id, row.project_id);
  return { releaseId: row.id, releaseHash: row.payload_hash, observationScope: 'persisted_local_invocations',
    deploymentObserved: production.count > 0, historicalObservation: true, runs: observed, counts,
    slots: await slotViews(db, row),
    reviews: await db.all('SELECT id, actor, decision, note, expires_at FROM studio_release_reviews WHERE release_id=? ORDER BY rowid DESC LIMIT 100', row.id),
    feedback: await db.all('SELECT id, actor, body, run_id AS runId, created_at FROM studio_production_feedback WHERE release_id=? ORDER BY rowid DESC LIMIT 100', row.id),
    authorizationRechecked: false, costUsd: null, latencyMetrics: null, throughputMeasured: false,
    truthValidated: false, promotionGranted: false, limit: 100 };
}
async function boundRun(db, context) {
  const { row } = await store.release(db, context);
  const id = input.text(context.runId || context.body.runId, 200);
  const run = await db.get(`SELECT r.*, i.environment, i.slot_revision, i.release_hash FROM workflow_runs r
    JOIN studio_deployment_invocations i ON i.run_id=r.id WHERE r.id=? AND i.release_id=?
    AND r.workflow_id=? AND r.workflow_version=? AND r.organization_id=? AND r.project_id=?`,
  id, row.id, row.workflow_id, row.version, row.organization_id, row.project_id);
  if (!run) throw failure('RELEASE_RUN_NOT_FOUND', 404);
  if (run.release_hash !== row.payload_hash) throw failure('INVOCATION_BINDING_INVALID', 409);
  return { row, run };
}
async function inspectRun(db, context) {
  const { row, run } = await boundRun(db, context);
  const traceId = 'trace-' + run.id;
  return { releaseId: row.id, releaseHash: row.payload_hash, runId: run.id, version: run.workflow_version,
    status: run.status, environment: run.environment, revision: run.slot_revision,
    executionCompleted: run.status === 'completed', outputHash: run.output_json ? store.digest(run.output_json) : null,
    traceId, spans: await db.all('SELECT id,name,start_time,end_time FROM trace_spans WHERE trace_id=? AND organization_id=? AND project_id=? LIMIT 100',
      traceId, row.organization_id, row.project_id),
    error: run.error_json ? JSON.parse(run.error_json) : null, truthValidated: false, promotionGranted: false };
}
async function feedback(db, context) {
  return withTransaction(db, async () => {
    const { row, run } = await boundRun(db, context);
    const body = input.text(context.body.body);
    const outputHash = run.output_json ? store.digest(run.output_json) : null;
    const memory = await require('./decisionEvidenceService').persistDecision({ db, scope: context.scope, createdBy: context.actor,
      title: 'Retour de production Studio', category: 'StudioProductionFeedback',
      content: JSON.stringify({ releaseId: row.id, releaseHash: row.payload_hash, runId: run.id, outputHash, body }), evidenceRefs: [] });
    await db.run('INSERT INTO studio_production_feedback(id,release_id,run_id,actor,body) VALUES(?,?,?,?,?)', memory.id, row.id, run.id, context.actor, body);
    return { feedbackId: memory.id, releaseId: row.id, releaseHash: row.payload_hash, runId: run.id,
      actor: context.actor, provenanceHash: memory.provenanceHash, evidenceStatus: memory.evidenceStatus,
      truthValidated: false, promotionGranted: false, nextStep: 'create_and_review_a_new_version' };
  });
}
module.exports = { inspect, inspectRun, feedback };
