'use strict';
const assert = require('node:assert/strict');
const { action } = require('./studioGenosBrowserJourney.cjs');
const root = '/api/studio/production';
const staging = root + '/workflows/studio-app/slots/staging';
const production = root + '/workflows/studio-app/slots/production';
async function execute(page, spec) {
  const admitted = await action(page, { id: 'production-invoke', route: staging + '/invoke' });
  assert.equal(admitted.executionCompleted, false);
  await require('../../src/services/jobWorker').processOnce();
  const run = await spec.db.get('SELECT * FROM workflow_runs WHERE id=?', admitted.runId);
  assert.equal(run.status, 'completed');
  return admitted;
}
async function reviewed(page, context) {
  const { spec, frozen } = context;
  await action(page, { id: 'production-publish', route: staging + '/publish', fields: { note: 'qualification locale' } });
  const admitted = await execute(page, spec);
  const route = root + '/releases/' + frozen.releaseId + '/reviews';
  await action(page, { id: 'production-review', route, fields: { note: 'revue du modele structurel' }, status: 403 });
  await spec.db.run("UPDATE project_memberships SET role='owner' WHERE project_id='b06-project'");
  const review = await action(page, { id: 'production-review', route });
  assert.equal(review.actor, 'b06-key');
  assert.equal(review.truthValidated, false);
  return { admitted, review };
}
async function deployment(page, context) {
  const { spec, frozen } = context;
  const result = await reviewed(page, context);
  const published = await action(page, { id: 'production-publish', route: production + '/publish',
    fields: { environment: 'production', expectedRevision: '0' } });
  assert.equal(published.localPublished, true);
  const invoked = await action(page, { id: 'production-invoke', route: production + '/invoke' });
  await require('../../src/services/jobWorker').processOnce();
  assert.equal((await spec.db.get('SELECT status FROM workflow_runs WHERE id=?', invoked.runId)).status, 'completed');
  const rolled = await action(page, { id: 'production-rollback', route: production + '/rollback', fields: { note: 'retrait controle' } });
  assert.equal(rolled.releaseId, null);
  assert.equal(rolled.externalEffectsReversible, false);
  assert.equal(frozen.releaseId, published.releaseId);
  const observed = await action(page, { id: 'production-run', route: root + '/releases/' + frozen.releaseId + '/runs/' + invoked.runId,
    method: 'GET', fields: { releaseId: frozen.releaseId, runId: invoked.runId } });
  assert.equal(observed.executionCompleted, true);
  assert.equal(observed.spans.length, 2);
  const feedback = await action(page, { id: 'production-feedback', route: root + '/releases/' + frozen.releaseId + '/feedback',
    fields: { releaseId: frozen.releaseId, body: 'Prochaine version a verifier sur davantage de cas' } });
  assert.equal(feedback.evidenceStatus, 'provisional');
  const operations = await action(page, { id: 'production-operations', route: root + '/releases/' + frozen.releaseId + '/operations',
    method: 'GET', fields: { releaseId: frozen.releaseId } });
  assert.equal(operations.deploymentObserved, true);
  assert.equal(operations.costUsd, null);
  assert.equal(operations.slots.find(item => item.environment === 'production').releaseId, null);
  assert.equal(operations.slots.find(item => item.environment === 'production').status, 'non publié');
  assert.equal(operations.slots.find(item => item.environment === 'staging').status, 'publié');
  assert.match(await page.locator('#production-result-summary').textContent(), /non publié/);
  return { ...result, productionRunId: invoked.runId, finalRevision: rolled.revision, feedbackId: feedback.feedbackId };
}
module.exports = { deployment };
