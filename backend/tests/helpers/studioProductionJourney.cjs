'use strict';
const assert = require('node:assert/strict');
const { request } = require('./studioRequest.cjs');
const root = '/api/studio/production';
const slot = root + '/workflows/studio-app/slots/';
async function completed(spec, release) {
  const publish = await request(spec, slot + 'staging/publish', { body: { releaseId: release.releaseId,
    releaseHash: release.releaseHash, expectedRevision: 0, note: 'qualification staging' } });
  assert.equal(publish.status, 200);
  const invocation = await request(spec, slot + 'staging/invoke', { body: { releaseHash: release.releaseHash, expectedRevision: 1, input: {} } });
  assert.equal(invocation.status, 200);
  assert.equal(invocation.value.executionCompleted, false);
  await require('../../src/services/jobWorker').processOnce();
  const run = await spec.db.get('SELECT * FROM workflow_runs WHERE id = ?', invocation.value.runId);
  assert.equal(run.status, 'completed');
  assert.equal(JSON.parse(run.output_json).nodes, 2);
  const spans = await spec.db.all('SELECT id FROM trace_spans WHERE trace_id = ?', 'trace-' + run.id);
  assert.equal(spans.length, 2);
  return run;
}
async function publication(spec, release) {
  const run = await completed(spec, release);
  const body = { releaseHash: release.releaseHash, runId: run.id, decision: 'approved', note: 'modele structurel examine' };
  const route = root + '/releases/' + release.releaseId + '/reviews';
  assert.equal((await request(spec, route, { body })).status, 403);
  await spec.db.run("UPDATE project_memberships SET role='owner' WHERE project_id='b06-project'");
  const review = await request(spec, route, { body: { ...body, actor: 'forged' } });
  assert.equal(review.status, 200);
  assert.equal(review.value.actor, 'b06-key');
  const deployment = { releaseId: release.releaseId, releaseHash: release.releaseHash, expectedRevision: 0, reviewId: review.value.reviewId, note: 'publication locale' };
  assert.equal((await request(spec, slot + 'production/publish', { body: deployment })).status, 200);
  assert.equal((await request(spec, slot + 'production/publish', { body: deployment })).status, 409);
  await spec.db.run("UPDATE studio_release_reviews SET expires_at='2000-01-01' WHERE id=?", review.value.reviewId);
  assert.equal((await request(spec, slot + 'production/publish', { body: { ...deployment, expectedRevision: 1 } })).value.error.code, 'PRODUCTION_REVIEW_EXPIRED');
  const rollback = await request(spec, slot + 'production/rollback', { body: { expectedRevision: 1, note: 'retirer la premiere version' } });
  assert.equal(rollback.status, 200);
  assert.equal(rollback.value.releaseId, null);
  assert.equal((await request(spec, slot + 'production/invoke', { body: { expectedRevision: 2 } })).status, 409);
  assert.equal((await request(spec, slot + 'staging', { project: 'b06-other' })).status, 404);
  return { run, review };
}
module.exports = { completed, publication };
