'use strict';
const assert = require('node:assert/strict');
const { request } = require('./studioRequest.cjs');
const root = '/api/studio/production';
async function feedback(spec, context) {
  const { release, runId } = context;
  const route = root + '/releases/' + release.releaseId;
  const observed = await request(spec, route + '/runs/' + runId);
  assert.equal(observed.status, 200);
  assert.equal(observed.value.executionCompleted, true);
  assert.equal(observed.value.spans.length, 2);
  const saved = await request(spec, route + '/feedback', { body: { runId, body: 'Ameliorer la prochaine version', actor: 'forged' } });
  assert.equal(saved.status, 200);
  assert.equal(saved.value.actor, 'b06-key');
  const memory = await request(spec, '/api/studio/memories/' + saved.value.feedbackId);
  assert.equal(memory.value.memory.integrityChecked, true);
  assert.equal(saved.value.evidenceStatus, 'provisional');
  assert.equal(saved.value.promotionGranted, false);
  const operations = await request(spec, route + '/operations');
  assert.equal(operations.value.deploymentObserved, true);
  assert.equal(operations.value.costUsd, null);
  assert.equal(operations.value.feedback.length, 1);
  assert.equal((await request(spec, route + '/operations', { project: 'b06-other' })).status, 404);
  assert.equal((await request(spec, route + '/feedback', { body: { runId: 'foreign', body: 'rejected' } })).status, 404);
  assert.equal((await request(spec, route + '/feedback', { body: { runId, body: '' } })).status, 400);
}
async function queuedTamper(spec, release) {
  const route = root + '/workflows/studio-app/slots/staging/invoke';
  const body = { expectedRevision: 2, releaseHash: release.releaseHash, input: {} };
  const admitted = await request(spec, route, { body });
  assert.equal(admitted.status, 200);
  await spec.db.run('DELETE FROM studio_deployment_invocations WHERE run_id=?', admitted.value.runId);
  await require('../../src/services/jobWorker').processOnce();
  const failed = await spec.db.get('SELECT status,error_json FROM workflow_runs WHERE id=?', admitted.value.runId);
  assert.equal(failed.status, 'failed');
  assert.match(failed.error_json, /INVOCATION_BINDING_MISSING/);
  const next = await request(spec, route, { body });
  await spec.db.run("UPDATE workflow_versions SET metadata_json='{}' || ' ' WHERE id='studio-app-v2'");
  await spec.db.run("UPDATE workflow_versions SET graph_json='{}' WHERE id='studio-app-v2'");
  await require('../../src/services/jobWorker').processOnce();
  const changed = await spec.db.get('SELECT status,error_json FROM workflow_runs WHERE id=?', next.value.runId);
  assert.equal(changed.status, 'failed');
  assert.match(changed.error_json, /RELEASE_SOURCE_CHANGED/);
}
module.exports = { feedback, queuedTamper };
