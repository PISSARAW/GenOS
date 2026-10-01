'use strict';

const assert = require('assert');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const protocol = require('../src/services/gvxExperimentProtocol');

function plan() {
  const snapshotHash = 'a'.repeat(64);
  return {
    scope: { organizationId: 'org-a', projectId: 'project-a' }, entityId: 'organism-a',
    snapshotHash, worldBudget: 10,
    controls: { model: 'model-v1', toolsetHash: 'tools-v1', environmentHash: 'env-v1' },
    verifierRequirements: ['correctness', 'cost'],
    worlds: ['direct', 'structured', 'falsification'].map((chamber) => ({
      chamber, worldId: `world-${chamber}`, strategyId: `strategy-${chamber}`,
      isolationId: `isolation-${chamber}`, snapshotHash, budget: 10
    }))
  };
}

function evidence(requirement) {
  return { requirement, verifierId: `verifier-${requirement}`, artifactHash: 'b'.repeat(64) };
}

function outcomes() {
  return plan().worlds.map((world) => ({
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
    assert.strictEqual(stored.worlds.length, 3);
    assert.strictEqual(protocol.assessOutcomes(stored, outcomes()).status, 'ready_for_independent_review');
    assert.strictEqual(protocol.assessOutcomes(stored, []).status, 'inconclusive');
    assert.strictEqual(protocol.assessOutcomes(stored, outcomes().map((item) => ({ ...item, evidence: [] }))).status, 'blocked');
    const finished = await protocol.recordExperimentOutcomes(db, {
      scope: input.scope, entityId: input.entityId, plan: stored, outcomes: outcomes()
    });
    assert.strictEqual(finished.payload.assessment.promotionAllowed, false);
    assert.ok(protocol.validatePlan({ ...plan(), worlds: plan().worlds.map((world) => ({ ...world, snapshotHash: 'c'.repeat(64) })) }).includes('world-snapshot-mismatch'));
  } finally { await db.close(); }
  console.log('GVX experiment protocol checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
