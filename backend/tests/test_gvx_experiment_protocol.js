'use strict';

const assert = require('assert');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const protocol = require('../src/services/gvxExperimentProtocol');

function makeArms(roles) {
  const snapshotHash = 'a'.repeat(64);
  return roles.map((role) => ({ armId: role, role, worldId: `world-${role}`,
    strategyId: `strategy-${role}`, isolationId: `isolation-${role}`, snapshotHash, budget: 10 }));
}

function plan(type = 'trinity', roles = ['direct', 'structured', 'falsification']) {
  const snapshotHash = 'a'.repeat(64);
  return {
    scope: { organizationId: 'org-a', projectId: 'project-a' }, entityId: 'organism-a',
    snapshotHash, worldBudget: 10,
    controls: { model: 'model-v1', toolsetHash: 'tools-v1', environmentHash: 'env-v1' },
    verifierRequirements: ['correctness', 'cost'],
    experimentDesign: { type, arms: makeArms(roles) }
  };
}

function evidence(requirement) {
  return { requirement, verifierId: `verifier-${requirement}`, artifactHash: 'b'.repeat(64) };
}

function outcomes() {
  return plan().experimentDesign.arms.map((world) => ({
    worldId: world.worldId, status: 'completed', evidence: [evidence('correctness'), evidence('cost')]
  }));
}

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateGvxLedger(db);
    const input = plan();
    const started = await protocol.recordExperimentPlan(db, input);
    const stored = started.payload.plan;
    assert.strictEqual(stored.experimentDesign.type, 'trinity');
    assert.strictEqual(stored.experimentDesign.arms.length, 3);
    assert.strictEqual(protocol.assessOutcomes(stored, outcomes()).status, 'ready_for_independent_review');
    assert.strictEqual(protocol.assessOutcomes(stored, []).status, 'inconclusive');
    assert.strictEqual(protocol.assessOutcomes(stored, outcomes().map((item) => ({ ...item, evidence: [] }))).status, 'blocked');
    const finished = await protocol.recordExperimentOutcomes(db, {
      scope: input.scope, entityId: input.entityId, plan: stored, outcomes: outcomes()
    });
    assert.strictEqual(finished.payload.assessment.promotionAllowed, false);
    for (const [type, roles] of [['paired', ['baseline', 'candidate']],
      ['multi_arm', ['baseline', 'variant-a', 'variant-b']],
      ['ablation', ['full', 'mechanism_removed']]]) {
      const design = plan(type, roles);
      assert.deepStrictEqual(protocol.validatePlan(design), [], `${type} design validates`);
      const assessed = protocol.assessOutcomes({ experimentId: 'exp', experimentDesign: design.experimentDesign,
        verifierRequirements: ['correctness', 'cost'] }, design.experimentDesign.arms.map((arm) => ({
        worldId: arm.worldId, status: 'completed', evidence: [evidence('correctness'), evidence('cost')]
      })));
      assert.strictEqual(assessed.status, 'ready_for_independent_review');
    }
    const invalidWorld = plan();
    invalidWorld.experimentDesign.arms[0].snapshotHash = 'c'.repeat(64);
    assert.ok(protocol.validatePlan(invalidWorld).includes('world-snapshot-mismatch'));
    const invalidTrinity = plan('trinity', ['baseline', 'candidate', 'control']);
    assert.ok(protocol.validatePlan(invalidTrinity).includes('experiment-trinity-roles-invalid'));
  } finally { await db.close(); }
  console.log('GVX experiment protocol checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
