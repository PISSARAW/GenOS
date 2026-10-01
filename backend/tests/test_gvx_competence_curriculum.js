'use strict';

const assert = require('assert');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const { planCompetenceCurriculum } = require('../src/services/gvxCompetenceCurriculum');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateGvxLedger(db);
    const input = {
      scope: { organizationId: 'org', projectId: 'project' }, entityId: 'agent',
      graph: { schema: 'genos.gvx.competence-graph/v1', nodes: [
        { skillId: 'advanced', epistemicStatus: 'unknown' }, { skillId: 'basic', epistemicStatus: 'unknown' }
      ], edges: [{ from: 'basic', to: 'advanced', relation: 'prerequisite' }], sourceEventIds: [] },
      targets: [{ skillId: 'advanced', priority: 10 }, { skillId: 'basic', priority: 1 }],
      maxCost: 3, maxSteps: 2,
      authority: { isAllowed: async () => true },
      prerequisiteVerifier: { isSatisfied: async (id) => id !== 'basic' },
      costEstimator: { estimate: async () => 2 }
    };
    const plan = await planCompetenceCurriculum(db, input);
    assert.deepStrictEqual(plan.steps.map((step) => step.skillId), ['basic']);
    assert.strictEqual(plan.evaluations.find((step) => step.skillId === 'advanced').status, 'prerequisite_blocked');
    assert.strictEqual(plan.steps[0].epistemicStatus, 'hypothesis');
    assert.strictEqual(plan.status, 'proposed');
    const rows = await db.all('SELECT event_type FROM gvx_development_events');
    assert.deepStrictEqual(rows.map((row) => row.event_type), ['evidence_attached']);
    await assert.rejects(planCompetenceCurriculum(db, { ...input, authority: null }), { code: 'GVX_CURRICULUM_INVALID' });
    await assert.rejects(planCompetenceCurriculum(db, { ...input, targets: [{ skillId: 'unknown', priority: 1 }] }), { code: 'GVX_CURRICULUM_TARGET_INVALID' });
  } finally { await db.close(); }
  console.log('GVX competence curriculum checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
