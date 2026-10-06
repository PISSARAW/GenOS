'use strict';

const assert = require('assert');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const { applySomaticCandidate } = require('../src/services/gvxSomaticApplication');
const { monitorSomaticApplication } = require('../src/services/gvxSomaticMonitor');

const base = {
  scope: { organizationId: 'org', projectId: 'project' }, entityId: 'agent',
  applicationId: 'app', parentHash: 'a'.repeat(64), candidateHash: 'b'.repeat(64),
  authorization: { authorize: async () => ({ allowed: true, approvalId: 'approved' }) }
};

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  let rollbacks = 0;
  try {
    await migrateGvxLedger(db);
    const runtime = {
      apply: async () => ({ beforeHash: base.parentHash, afterHash: base.candidateHash, rollbackToken: 'token' }),
      rollback: async () => { rollbacks += 1; return { restoredHash: base.parentHash }; },
      observe: async () => ({
        window: { startedAt: '2026-10-01T00:00:00Z', endedAt: '2026-10-01T00:01:00Z' },
        baseline: { suiteHash: 'd'.repeat(64), metrics: { quality: { mean: 10, samples: 5 } } },
        candidate: { suiteHash: 'd'.repeat(64), metrics: { quality: { mean: 6, samples: 5 } } },
        evidenceRefs: [{ artifactHash: 'e'.repeat(64), verifierId: 'quality-v1' }]
      })
    };
    await applySomaticCandidate(db, { ...base, runtime, change: {} });
    const result = await monitorSomaticApplication(db, {
      ...base, runtime, observationId: 'window-1',
      profile: { minSamples: 3, rules: [{ metric: 'quality', objective: 'higher', minImprovement: 1, maxRegression: 2 }] }
    });
    assert.strictEqual(result.assessment.status, 'reject');
    assert.strictEqual(result.rollback.payload.result.status, 'restored');
    assert.strictEqual(rollbacks, 1);
    const replay = await monitorSomaticApplication(db, {
      ...base, runtime, observationId: 'window-1',
      profile: { minSamples: 3, rules: [{ metric: 'quality', objective: 'higher', minImprovement: 1, maxRegression: 2 }] }
    });
    assert.strictEqual(replay.assessment.status, 'reject');
    assert.strictEqual(rollbacks, 1);
    await assert.rejects(monitorSomaticApplication(db, {
      ...base, applicationId: 'other-app', runtime, observationId: 'window-1',
      profile: { minSamples: 3, rules: [{ metric: 'quality', objective: 'higher', minImprovement: 1, maxRegression: 2 }] }
    }), { code: 'GVX_OBSERVATION_CONFLICT' });
  } finally { await db.close(); }
  console.log('GVX somatic monitor checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
