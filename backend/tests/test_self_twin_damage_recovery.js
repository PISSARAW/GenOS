'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const recovery = require('../src/services/selfTwin/selfTwinDamageRecoveryService');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const scope = { organizationId: 'org', projectId: 'project', entityId: 'agent' };
  try {
    await migrateGvxLedger(db);
    const options = { db, scope, prediction: { predictionId: 'prediction-1', target: 'sensor',
      effects: [] }, observations: [{ metric: 'latency', predicted: 10, observed: 80 }],
      evidenceRefs: ['artifact:failure'], components: ['perception', 'router'], budget: { maxInterventions: 2 } };
    const diagnosis = await recovery.diagnose(options);
    assert.equal(diagnosis.status, 'diagnostic_hypotheses');
    assert.equal(diagnosis.repairApplied, false);
    assert.ok(diagnosis.candidateDependencies.some((item) => item.source.startsWith('latent:')));
    let calls = 0;
    const result = await recovery.recover({ ...options, runInNursery: async ({ intervention }) => {
      calls += 1;
      assert.equal(intervention.design, 'randomized_controlled');
      return { status: 'completed', evidenceRefs: ['receipt:nursery'] };
    } });
    assert.equal(calls, 2);
    assert.equal(result.status, 'nursery_review_required');
    assert.equal(result.promotionAllowed, false);
    assert.ok(result.outcomes.every((item) => item.repairApplied === false));
    await assert.rejects(() => recovery.recover(options), /isolated nursery/);
  } finally { await db.close(); }
  console.log('Self-Twin unknown-dependency and bounded recovery checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
