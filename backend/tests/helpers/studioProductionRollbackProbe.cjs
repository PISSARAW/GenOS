'use strict';
const assert = require('node:assert/strict');
const { request } = require('./studioRequest.cjs');
const root = '/api/studio/production';
const slot = root + '/workflows/studio-app/slots/';
async function approval(spec, release, runId) {
  const result = await request(spec, root + '/releases/' + release.releaseId + '/reviews', { body: {
    releaseHash: release.releaseHash, runId, decision: 'approved', note: 'revue explicite de cette version' } });
  assert.equal(result.status, 200);
  return result.value.reviewId;
}
async function publish(spec, release, settings) {
  const result = await request(spec, slot + settings.environment + '/publish', { body: {
    ...release, expectedRevision: settings.revision, reviewId: settings.reviewId, note: 'publication sous CAS' } });
  assert.equal(result.status, 200);
  return result;
}
async function invoke(spec, release, settings) {
  const result = await request(spec, slot + settings.environment + '/invoke', { body: {
    releaseHash: release.releaseHash, expectedRevision: settings.revision, input: {} } });
  assert.equal(result.status, 200);
  await require('../../src/services/jobWorker').processOnce();
  const run = await spec.db.get('SELECT * FROM workflow_runs WHERE id = ?', result.value.runId);
  assert.equal(run.status, 'completed');
  assert.equal(JSON.parse(run.output_json).nodes, settings.nodes);
  return run.id;
}
async function probe(spec, context) {
  const { release: first, run } = context;
  const firstReview = await approval(spec, first, run.id);
  await publish(spec, first, { environment: 'production', revision: 2, reviewId: firstReview });
  await require('./studioProductionFixture.cjs').secondVersion(spec);
  const next = await request(spec, root + '/releases', { body: { workflowId: 'studio-app', version: 2 } });
  assert.equal(next.status, 200);
  await publish(spec, next.value, { environment: 'staging', revision: 1 });
  const nextRun = await invoke(spec, next.value, { environment: 'staging', revision: 2, nodes: 3 });
  const nextReview = await approval(spec, next.value, nextRun);
  await publish(spec, next.value, { environment: 'production', revision: 3, reviewId: nextReview });
  const rolled = await request(spec, slot + 'production/rollback', { body: { expectedRevision: 4, note: 'restaurer v1' } });
  assert.equal(rolled.status, 200);
  assert.equal(rolled.value.version, 1);
  const restoredRunId = await invoke(spec, first, { environment: 'production', revision: 5, nodes: 2 });
  const body = { ...next.value, reviewId: nextReview, expectedRevision: 5, note: 'course CAS' };
  const race = await Promise.all([request(spec, slot + 'production/publish', { body }), request(spec, slot + 'production/publish', { body })]);
  assert.deepEqual(race.map(result => result.status).sort(), [200, 409]);
  await spec.db.run("UPDATE project_memberships SET role='member' WHERE project_id='b06-project'");
  const revoked = await request(spec, slot + 'production/publish', { body: { ...body, expectedRevision: 6 } });
  assert.equal(revoked.value.error.code, 'REVIEW_AUTHORITY_REVOKED');
  await spec.db.run("UPDATE project_memberships SET role='owner' WHERE project_id='b06-project'");
  await request(spec, root + '/releases/' + next.value.releaseId + '/reviews', { body: {
    releaseHash: next.value.releaseHash, runId: nextRun, decision: 'rejected', note: 'dissentiment conserve' } });
  assert.equal((await request(spec, slot + 'production/publish', { body: { ...body, expectedRevision: 6 } })).value.error.code, 'PRODUCTION_REVIEW_SUPERSEDED');
  return { nextRelease: next.value, restoredRunId };
}
module.exports = { probe };
