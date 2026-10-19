'use strict';

const assert = require('node:assert/strict');
const fixture = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const { registerResponsibility, reviseResponsibility } = require('../src/services/shev/responsibilityService');
const { registerProductManifest } = require('../src/services/shev/productStewardshipService');
const { normalizeManifest } = require('../src/services/shev/productStewardshipContract');
const authority = require('./shevFixture').authority();

const projectId = 'shev-product-stewardship';
const mandate = { purpose: 'Maintenir le produit apres sa livraison', autoDiagnose: true,
  autoInstrument: false, dimensions: [{ name: 'user-value', expected: 'Usage durable sans regression',
    acceptance: ['Effet utilisateur verifie independamment.'] }] };

function manifestInput(overrides = {}) {
  return { id: 'product-build-17', projectId, dimension: 'user-value', buildRef: 'build:17',
    trajectory: ['preview verifiee', 'deploiement externe explicite', 'effet utilisateur observe'],
    qualityCriteria: ['Parcours critique disponible', 'Aucune regression critique'],
    risks: [{ id: 'checkout-regression', severity: 'high', mitigation: 'Arreter puis restaurer build:16.' }],
    rollback: { actionRef: 'runbook:rollback-build', checkpointRef: 'build:16',
      evidenceRefs: ['artifact:rollback-drill-16'] },
    learningTarget: { organizationId: 'org-test', agentId: 'agent-builder' },
    previewEvidenceRefs: ['artifact:preview-build-17'], ...overrides };
}

async function setup(db) {
  await store.createProject(db, { id: projectId, rootPath: 'C:/test', branch: 'codex/test',
    objective: 'Maintenir le produit', config: fixture.testConfig() });
  await registerResponsibility(db, { projectId, authorityRef: 'owner:test',
    authorityPublicKey: authority.publicKey, mandate });
  await reviseResponsibility(db, { projectId, expectedVersion: 1, mandate, stage: 'assisted',
    authorization: authority.authorize({ operation: 'mandate-revision', projectId,
      subjectId: projectId, expectedVersion: 1, details: { mandate: normalizeMandate(), stage: 'assisted' } }) });
}

function normalizeMandate() {
  return { purpose: mandate.purpose, dimensions: mandate.dimensions,
    autoDiagnose: mandate.autoDiagnose, autoInstrument: mandate.autoInstrument };
}

function authorizedManifest(input) {
  const normalized = normalizeManifest(input);
  return { ...input, expectedVersion: 2,
    authorization: authority.authorize({ operation: 'product-manifest-registration', projectId,
      subjectId: input.id, expectedVersion: 2, details: normalized }) };
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    await setup(db);
    const input = manifestInput();
    const registered = await registerProductManifest(db, authorizedManifest(input));
    assert.equal(registered.manifest.buildRef, 'build:17');
    assert.equal(registered.manifest.rollback.checkpointRef, 'build:16');
    assert.equal((await registerProductManifest(db, authorizedManifest(input))).replayed, true);
    assert.throws(() => authorizedManifest(manifestInput({ id: 'unsafe-build',
      buildRef: 'build:18', rollback: null })), /rollback/);
    await assert.rejects(db.run("UPDATE shev_product_manifests SET build_ref = 'changed'"), /immutable/);
    assert.equal((await db.get('SELECT COUNT(*) AS n FROM shev_product_stage_receipts')).n, 0);
    console.log('SHEV product stewardship manifest passed.');
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
