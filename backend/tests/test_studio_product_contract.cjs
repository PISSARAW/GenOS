'use strict';

const assert = require('node:assert/strict');
const { withFixture } = require('./helpers/studioGenosFixture.cjs');
const { request } = require('./helpers/studioRequest.cjs');

const route = '/api/studio/production/workflows/studio-app/product-contracts';
const base = { expectedRevision: 0, productGoal: 'Réduire les abandons sans masquer les erreurs',
  userHypotheses: [{ id: 'h-onboarding', targetUser: 'nouvel utilisateur',
    statement: 'Le guidage réduit les abandons', falsifier: 'Le taux d’abandon ne baisse pas' }],
  qualityCriteria: [
    { id: 'q-visual', modality: 'visual', statement: 'Hiérarchie lisible', threshold: 'score >= 0.8' },
    { id: 'q-function', modality: 'functional', statement: 'Parcours terminé', threshold: '100% des cas critiques' }
  ], rollbackPlan: { scope: 'admissions futures', trigger: 'régression critique observée' } };

async function probe(spec) {
  await require('./helpers/studioProductionFixture.cjs').seed(spec);
  const first = await request(spec, route, { body: base });
  assert.equal(first.status, 200);
  assert.equal(first.value.revision, 1);
  assert.equal(first.value.boundaries.autoDeploymentAllowed, false);
  assert.equal(first.value.learningPolicy.holdoutRequired, true);
  assert.equal((await request(spec, route, { body: base })).status, 409);
  const invalid = structuredClone(base);
  invalid.qualityCriteria = invalid.qualityCriteria.filter(item => item.modality !== 'visual');
  assert.equal((await request(spec, route, { body: { ...invalid, expectedRevision: 1 } })).value.error.code,
    'PRODUCT_PLURAL_CRITERIA_REQUIRED');
  const second = await request(spec, route, { body: { ...base, expectedRevision: 1,
    productGoal: 'Réduire durablement les abandons' } });
  assert.equal(second.status, 200);
  assert.equal(second.value.revision, 2);
  assert.equal(second.value.parentId, first.value.contractId);
  const current = await request(spec, route + '/current');
  assert.equal(current.value.contractHash, second.value.contractHash);
  await spec.db.run("UPDATE studio_product_contracts SET payload_json='{}' WHERE id=?", second.value.contractId);
  assert.equal((await request(spec, route + '/current')).value.error.code, 'PRODUCT_CONTRACT_INTEGRITY_FAILED');
  console.log('Studio product contract: versioned hypotheses, plural criteria and integrity gate passed.');
}

withFixture(probe).catch(error => { console.error(error); process.exitCode = 1; });
