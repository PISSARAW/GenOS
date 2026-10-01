'use strict';

const assert = require('assert');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const { proposeTransformation, validateCandidate } = require('../src/services/gvxTransformation');

function candidate() {
  return {
    scope: { organizationId: 'org-a', projectId: 'project-a' }, entityId: 'organism-a',
    title: 'Try a lower-cost topology', plasticity: 'P5', destination: 'soma',
    parentHash: 'a'.repeat(64), sourceExperienceIds: ['experience-1'],
    hypothesis: {
      statement: 'A simple topology is sufficient for this task family.',
      prediction: 'Quality stays within the accepted margin while cost falls.',
      falsificationCriteria: 'A held-out failure outside the margin rejects the candidate.',
      protocol: 'Run matched tasks with fixed model, tools, and budget.', heldOutRefs: ['suite-secret-ref']
    },
    skillDelta: { adds: ['low-cost-routing'], requires: [] }, maxCost: 2,
    maxSeconds: 60, risk: 'low', verifierProfile: 'matched-benchmark-v1',
    rollbackPlan: 'Restore the parent snapshot.'
  };
}

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateGvxLedger(db);
    const saved = await proposeTransformation(db, candidate());
    assert.strictEqual(saved.type, 'transformation_proposed');
    assert.strictEqual(saved.payload.candidate.plasticity, 'P5');
    assert.deepStrictEqual(saved.payload.candidate.hypothesis.heldOutRefs, ['suite-secret-ref']);
    assert.ok(validateCandidate({ ...candidate(), plasticity: 'P99' }).includes('plasticity-unknown'));
    await assert.rejects(proposeTransformation(db, { ...candidate(), hypothesis: {} }), { code: 'GVX_TRANSFORMATION_INVALID' });
  } finally { await db.close(); }
  console.log('GVX transformation checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
