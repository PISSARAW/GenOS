'use strict';

const assert = require('node:assert/strict');
const { withFixture } = require('./helpers/studioGenosFixture.cjs');
const { request } = require('./helpers/studioRequest.cjs');
const evaluation = require('../src/services/studioProductEvaluationService');

const root = '/api/studio/production';
const contractBody = { expectedRevision: 0, productGoal: 'Valider un parcours durable',
  userHypotheses: [{ id: 'h-retention', targetUser: 'utilisateur actif',
    statement: 'Le parcours facilite la tâche', falsifier: 'Aucun gain de complétion' }],
  qualityCriteria: [
    { id: 'q-visual', modality: 'visual', statement: 'Lecture nette', threshold: 'score >= 0.8' },
    { id: 'q-functional', modality: 'functional', statement: 'Flux complet', threshold: '10/10 cas' }
  ], rollbackPlan: { scope: 'admissions futures', trigger: 'régression observée' } };

function context(spec, ids, actor, body = {}) {
  return { scope: { organizationId: 'b06-org', projectId: 'b06-project' }, actor,
    releaseId: ids.releaseId, contractId: ids.contractId, body };
}

async function setup(spec) {
  await require('./helpers/studioProductionFixture.cjs').seed(spec);
  const contract = await request(spec, root + '/workflows/studio-app/product-contracts',
    { body: contractBody });
  const release = await request(spec, root + '/releases',
    { body: { workflowId: 'studio-app', version: 1 } });
  return { contractId: contract.value.contractId, releaseId: release.value.releaseId };
}

async function addEvaluation(spec, ids, actor, modality, criterionId) {
  return evaluation.evaluate(spec.db, context(spec, ids, actor, { modality,
    verdict: 'supported', criterionIds: [criterionId],
    evidenceRefs: [`evidence:${actor}`], note: `Revue ${modality}` }));
}

async function probe(spec) {
  const ids = await setup(spec);
  assert.equal((await evaluation.decision(spec.db, context(spec, ids, 'reader'))).decision,
    'NO_CHANGE');
  await assert.rejects(addEvaluation(spec, ids, 'b06-key', 'visual', 'q-visual'),
    error => error.code === 'PRODUCT_EVALUATOR_NOT_INDEPENDENT');
  await addEvaluation(spec, ids, 'reviewer-visual', 'visual', 'q-visual');
  assert.equal((await evaluation.decision(spec.db, context(spec, ids, 'reader'))).decision,
    'NO_CHANGE');
  await addEvaluation(spec, ids, 'reviewer-functional', 'functional', 'q-functional');
  const ready = await evaluation.decision(spec.db, context(spec, ids, 'reader'));
  assert.equal(ready.decision, 'READY_FOR_ACCEPTANCE');
  assert.equal(ready.acceptanceGranted, false);
  assert.equal(ready.effectObserved, false);
  await assert.rejects(evaluation.accept(spec.db, context(spec, ids, 'b06-key',
    { decision: 'accepted', note: 'acceptation explicite' })),
  error => error.code === 'PRODUCT_ACCEPTANCE_FORBIDDEN');
  await spec.db.run("UPDATE project_memberships SET role='owner' WHERE project_id='b06-project'");
  const accepted = await evaluation.accept(spec.db, context(spec, ids, 'b06-key',
    { decision: 'accepted', note: 'acceptation explicite' }));
  assert.equal(accepted.acceptanceGranted, true);
  assert.equal(accepted.deploymentTriggered, false);
  assert.ok(await evaluation.requireAcceptance(spec.db, context(spec, ids, 'reader')));
  await spec.db.run(`UPDATE studio_product_evaluations SET verdict='refuted'
    WHERE release_id=? AND modality='functional'`, ids.releaseId);
  const rejected = await evaluation.decision(spec.db, context(spec, ids, 'reader'));
  assert.equal(rejected.decision, 'REJECT');
  assert.equal(rejected.rollbackRecommended, true);
  await assert.rejects(evaluation.requireAcceptance(spec.db, context(spec, ids, 'reader')),
    error => error.code === 'PRODUCT_ACCEPTANCE_REQUIRED');
  console.log('Studio product evaluation: plural preview, explicit acceptance, stale gate and NO_CHANGE passed.');
}

withFixture(probe).catch(error => { console.error(error); process.exitCode = 1; });
