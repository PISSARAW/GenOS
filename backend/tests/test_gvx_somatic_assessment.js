'use strict';

const assert = require('assert');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const { assessSomaticCandidate, recordSomaticAssessment } = require('../src/services/gvxSomaticAssessment');

function comparison(candidateQuality, candidateCost, samples = 20) {
  return {
    scope: { organizationId: 'org-a', projectId: 'project-a' }, entityId: 'organism-a',
    parentHash: 'a'.repeat(64), candidateHash: 'b'.repeat(64),
    baseline: { suiteHash: 'suite-hash', metrics: { quality: { mean: 0.8, samples }, cost: { mean: 10, samples } } },
    candidate: { suiteHash: 'suite-hash', metrics: { quality: { mean: candidateQuality, samples }, cost: { mean: candidateCost, samples } } },
    profile: {
      minSamples: 10,
      rules: [
        { metric: 'quality', objective: 'higher', minImprovement: 0.01, maxRegression: 0.02 },
        { metric: 'cost', objective: 'lower', minImprovement: 0.1, maxRegression: 1 }
      ]
    },
    evidenceRefs: [{ artifactHash: 'c'.repeat(64), verifierId: 'external-v1' }]
  };
}

async function main() {
  const improving = assessSomaticCandidate(comparison(0.84, 8));
  assert.strictEqual(improving.status, 'recommend_somatic_trial');
  assert.strictEqual(improving.promotionAllowed, false);
  assert.strictEqual(assessSomaticCandidate(comparison(0.7, 8)).status, 'reject');
  assert.strictEqual(assessSomaticCandidate(comparison(0.84, 8, 2)).status, 'inconclusive');
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateGvxLedger(db);
    const saved = await recordSomaticAssessment(db, comparison(0.84, 8));
    assert.strictEqual(saved.payload.assessment.status, 'recommend_somatic_trial');
  } finally { await db.close(); }
  console.log('GVX somatic assessment checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
