'use strict';

const assert = require('node:assert/strict');
const { withFixture } = require('./helpers/studioGenosFixture.cjs');
const { request } = require('./helpers/studioRequest.cjs');
const evaluation = require('../src/services/studioProductEvaluationService');
const effects = require('../src/services/studioProductEffectService');

const root = '/api/studio/production';

function scoped(ids, actor, body = {}) {
  return { scope: { organizationId: 'b06-org', projectId: 'b06-project' }, actor,
    releaseId: ids.releaseId, contractId: ids.contractId, body };
}

async function setup(spec) {
  await require('./helpers/studioProductionFixture.cjs').seed(spec);
  const contract = await request(spec, root + '/workflows/studio-app/product-contracts', { body: {
    expectedRevision: 0, productGoal: 'Améliorer la réussite réelle',
    userHypotheses: [{ id: 'h-success', targetUser: 'utilisateur réel',
      statement: 'Le taux de réussite augmente', falsifier: 'Le taux baisse' }],
    qualityCriteria: [
      { id: 'q-v', modality: 'visual', statement: 'Lisible', threshold: '0.8' },
      { id: 'q-f', modality: 'functional', statement: 'Fonctionne', threshold: '10/10' }
    ], rollbackPlan: { scope: 'admissions futures', trigger: 'régression réelle' } } });
  const release = await request(spec, root + '/releases',
    { body: { workflowId: 'studio-app', version: 1 } });
  const ids = { contractId: contract.value.contractId, releaseId: release.value.releaseId,
    releaseHash: release.value.releaseHash };
  await evaluation.evaluate(spec.db, scoped(ids, 'visual-observer', { modality: 'visual',
    verdict: 'supported', criterionIds: ['q-v'], evidenceRefs: ['preview:v'], note: 'visuel' }));
  await evaluation.evaluate(spec.db, scoped(ids, 'functional-observer', { modality: 'functional',
    verdict: 'supported', criterionIds: ['q-f'], evidenceRefs: ['preview:f'], note: 'fonctionnel' }));
  await spec.db.run("UPDATE project_memberships SET role='owner' WHERE project_id='b06-project'");
  await evaluation.accept(spec.db, scoped(ids, 'b06-key',
    { decision: 'accepted', note: 'acceptation produit' }));
  return ids;
}

async function completedRun(spec, ids, suffix) {
  const runId = `effect-run-${suffix}`;
  await spec.db.run(`INSERT INTO workflow_runs
    (id,workflow_id,workflow_version,organization_id,project_id,status,input_json,output_json,max_attempts,timeout_ms)
    VALUES(?,'studio-app',1,'b06-org','b06-project','completed','{}','{}',1,30000)`, runId);
  await spec.db.run(`INSERT INTO studio_deployment_invocations
    (run_id,release_id,release_hash,environment,slot_revision,actor)
    VALUES(?,?,?,'production',1,'operator')`, runId, ids.releaseId, ids.releaseHash);
  return runId;
}

function metric(observed) {
  return { name: 'task_success', unit: 'ratio', baseline: 0.5, observed,
    minimumEffect: 0.1, sampleSize: 100, direction: 'increase' };
}

async function observe(spec, ids, observation) {
  return effects.observe(spec.db, scoped(ids, observation.observer,
    { hypothesisId: 'h-success', runId: observation.runId,
      contextKind: observation.contextKind, metric: metric(observation.observed),
      evidenceRefs: [`metric:${observation.observer}`] }));
}

async function probe(spec) {
  const ids = await setup(spec);
  const firstRun = await completedRun(spec, ids, 'production');
  await observe(spec, ids, { observer: 'effect-observer-a', contextKind: 'production',
    runId: firstRun, observed: 0.7 });
  const waiting = await effects.review(spec.db, scoped(ids, 'steward'));
  assert.equal(waiting.action, 'NO_CHANGE');
  assert.equal(waiting.boundaries.deploymentTriggered, false);
  const holdoutRun = await completedRun(spec, ids, 'holdout');
  await observe(spec, ids, { observer: 'effect-observer-b', contextKind: 'holdout',
    runId: holdoutRun, observed: 0.65 });
  const transfer = await effects.review(spec.db, scoped(ids, 'steward'));
  assert.equal(transfer.action, 'PROPOSE_TRANSFER_EXPERIMENT');
  assert.equal(transfer.learning.transferable, true);
  assert.equal(transfer.learning.requiresTargetExperiment, true);
  assert.equal(transfer.boundaries.humanApprovalRequired, true);
  const replay = await effects.review(spec.db, scoped(ids, 'steward'));
  assert.equal(replay.initiativeId, transfer.initiativeId);
  assert.equal(replay.replayed, true);
  const regressionRun = await completedRun(spec, ids, 'regression');
  await observe(spec, ids, { observer: 'effect-observer-c', contextKind: 'production',
    runId: regressionRun, observed: 0.4 });
  const rollback = await effects.review(spec.db, scoped(ids, 'steward'));
  assert.equal(rollback.action, 'ROLLBACK_RECOMMENDED');
  assert.equal(rollback.boundaries.rollbackTriggered, false);
  assert.equal(rollback.boundaries.deploymentTriggered, false);
  await spec.db.run("UPDATE studio_product_effects SET metric_json='{}' WHERE observer=?",
    'effect-observer-c');
  await assert.rejects(effects.review(spec.db, scoped(ids, 'steward')),
    error => error.code === 'PRODUCT_EFFECT_INTEGRITY_FAILED');
  console.log('Studio product effect: observed production, holdout transfer, NO_CHANGE and bounded rollback initiative passed.');
}

withFixture(probe).catch(error => { console.error(error); process.exitCode = 1; });
