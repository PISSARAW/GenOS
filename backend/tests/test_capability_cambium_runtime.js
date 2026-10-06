'use strict';
const assert = require('node:assert/strict');
const fixture = require('./capability_runtime_fixture');
const cambium = require('../src/services/morphogenesis/capabilities/cambiumService');
const lifecycle = require('../src/services/morphogenesis/capabilities/cambiumLifecycle');

async function register(db, input) {
  const cases = [
    { caseId: 'ordinary', environmentVersion: 'v1', facts: { idempotent: true, rare: false } },
    { caseId: 'unsafe', environmentVersion: 'v1', facts: { idempotent: false, rare: false } },
    { caseId: 'rare', environmentVersion: 'v1', facts: { idempotent: true, rare: true } },
    { caseId: 'version', environmentVersion: 'v2', facts: { idempotent: true, rare: false } }
  ];
  const ref = await fixture.proof(db, input.scopeId, { cases });
  await cambium.registerProcedure(db, { ...input, verificationRef: ref, environmentVersion: 'v1',
    procedure: { rules: [{ when: {}, decision: 'RETRY' }] }, conditions: [{ idempotent: true }],
    witnesses: [{ witnessId: `${input.claimId}:1`, artifactRef: ref, status: 'VERIFIED' },
      { witnessId: `${input.claimId}:2`, artifactRef: ref, status: 'VERIFIED' }] });
  return ref;
}
async function run(db) {
  const scope = fixture.scoped(db, 'PROJECT:memory');
  const ref = await register(db, { ...scope, claimId: 'parent' });
  await register(db, { ...scope, claimId: 'child' });
  await cambium.attachCounterexample(db, { ...scope, claimId: 'parent', counterexampleId: 'rare-counter',
    artifactRef: ref, condition: { rare: true } });
  const bad = await cambium.commitCompression(db, { ...scope, claimId: 'parent', removeWitnessIds: ['parent:2'],
    candidateConditions: [{}], compareDecisions: async () => ({ preserved: true }) });
  assert.equal(bad.reason, 'DECISION_BOUNDARY_LOST');
  assert.equal((await db.get("SELECT COUNT(*) AS n FROM morph_cambium_witnesses WHERE claim_id = 'parent'")).n, 2);
  const good = await cambium.commitCompression(db, { ...scope, claimId: 'parent', removeWitnessIds: ['parent:2'] });
  assert.equal(good.allowed, true);
  assert.equal(good.comparison.cases.length, 12);
  assert.ok(await scope.resolveArtifact(good.comparison.artifactRef));
  assert.equal((await cambium.loadClaimContext(db, { ...scope, claimId: 'parent', environmentVersion: 'v2', facts: {} })).usable, false);
  assert.equal((await cambium.loadClaimContext(db, { ...scope, claimId: 'parent', environmentVersion: 'v1', facts: { idempotent: true, rare: true } })).usable, false);
  await lifecycle.link(db, { ...scope, parentId: 'parent', childId: 'child' });
  await assert.rejects(lifecycle.link(db, { ...scope, parentId: 'child', childId: 'parent' }), /DEPENDENCY_CYCLE/);
  assert.equal((await cambium.loadClaimContext(db, { ...scope, claimId: 'child', environmentVersion: 'v1', facts: { idempotent: true, rare: true } })).usable, false);
  const invalidated = await lifecycle.invalidate(db, { ...scope, claimId: 'parent', reason: 'dependency changed', evidenceRef: ref });
  assert.deepEqual(invalidated.impacted.sort(), ['child', 'parent']);
  assert.equal((await cambium.loadClaimContext(db, { ...scope, claimId: 'child' })).usable, false);
}
module.exports = run;
