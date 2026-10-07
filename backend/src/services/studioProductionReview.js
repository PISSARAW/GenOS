'use strict';
const crypto = require('node:crypto');
const store = require('./studioProductionStore');
const input = require('./studioSpecialistInput');
const { failure } = require('./studioWorldsService');
const { withTransaction } = require('../db');

async function requireAuthority(db, context) {
  const membership = await db.get('SELECT role FROM project_memberships WHERE principal_id = ? AND project_id = ?', context.actor, context.scope.projectId);
  if (!['owner', 'admin'].includes(membership?.role)) {
    throw failure('PRODUCTION_REVIEW_FORBIDDEN', 403);
  }
}

async function observedRun(db, context) {
  const { row } = await store.release(db, context);
  const runId = input.text(context.body.runId, 200);
  const run = await db.get(`SELECT r.*, i.environment, i.release_hash FROM workflow_runs r
    JOIN studio_deployment_invocations i ON i.run_id = r.id WHERE r.id = ? AND i.release_id = ?
    AND r.workflow_id = ? AND r.workflow_version = ? AND r.organization_id = ? AND r.project_id = ?`,
  runId, row.id, row.workflow_id, row.version, context.scope.organizationId, context.scope.projectId);
  if (!run) throw failure('RELEASE_RUN_NOT_FOUND', 404);
  if (run.status !== 'completed' || run.error_json || run.release_hash !== row.payload_hash) throw failure('RELEASE_RUN_NOT_SUCCESSFUL', 409);
  return { row, run };
}

async function review(db, context) {
  await requireAuthority(db, context);
  return withTransaction(db, async () => {
    const { row, run } = await observedRun(db, context);
    if (run.environment !== 'staging') throw failure('STAGING_OBSERVATION_REQUIRED', 409);
    if (context.body.releaseHash !== row.payload_hash) throw failure('RELEASE_HASH_CONFLICT', 409);
    const decision = context.body.decision;
    if (!['approved', 'rejected'].includes(decision)) throw failure('REVIEW_DECISION_INVALID', 400);
    const note = input.text(context.body.note);
    const id = 'review-' + crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await db.run(`INSERT INTO studio_release_reviews(id,release_id,release_hash,run_id,output_hash,actor,decision,note,expires_at)
      VALUES(?,?,?,?,?,?,?,?,?)`, id, row.id, row.payload_hash, run.id, store.digest(run.output_json || ''), context.actor, decision, note, expiresAt);
    return { reviewId: id, releaseId: row.id, releaseHash: row.payload_hash, runId: run.id, decision, actor: context.actor,
      expiresAt, independentReview: false, truthValidated: false, promotionGranted: false };
  });
}

async function requireApproval(db, context) {
  const { row } = await store.release(db, context);
  const reviewId = input.text(context.body.reviewId, 200);
  const review = await db.get('SELECT * FROM studio_release_reviews WHERE id = ? AND release_id = ?', reviewId, row.id);
  if (!review || review.decision !== 'approved' || review.release_hash !== row.payload_hash) throw failure('PRODUCTION_REVIEW_REQUIRED', 409);
  const latest = await db.get('SELECT id FROM studio_release_reviews WHERE release_id = ? ORDER BY rowid DESC LIMIT 1', row.id);
  if (latest.id !== review.id) throw failure('PRODUCTION_REVIEW_SUPERSEDED', 409);
  if (Date.parse(review.expires_at) <= Date.now()) throw failure('PRODUCTION_REVIEW_EXPIRED', 409);
  const { run } = await observedRun(db, { ...context, body: { ...context.body, runId: review.run_id } });
  if (run.environment !== 'staging' || store.digest(run.output_json || '') !== review.output_hash) throw failure('REVIEW_OBSERVATION_CHANGED', 409);
  const membership = await db.get('SELECT role FROM project_memberships WHERE principal_id = ? AND project_id = ?', review.actor, context.scope.projectId);
  if (!['owner', 'admin'].includes(membership?.role)) throw failure('REVIEW_AUTHORITY_REVOKED', 409);
  return review;
}
module.exports = { review, requireApproval, observedRun, requireAuthority };
