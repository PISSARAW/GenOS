'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const nursery = require('../src/services/gvxExperimentalNursery');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await migrateGvxLedger(db);
  const scope = { organizationId: 'org', projectId: 'project', entityId: 'agent' };
  const hash = 'a'.repeat(64);
  const arm = (armId, role, worldId) => ({ armId, role, worldId, isolationId: `iso-${armId}`,
    snapshotHash: hash, strategyId: armId, budget: 1 });
  const result = await nursery.run({ db, scope, entityId: 'agent', snapshotHash: hash, worldBudget: 1,
    controls: { model: 'test', toolsetHash: hash, environmentHash: hash }, verifierRequirements: ['task'],
    experimentDesign: { type: 'paired', arms: [arm('a', 'baseline', 'wa'), arm('b', 'candidate', 'wb')] },
    verifierRegistry: { trustSource: 'control_plane', verifiers: [{ id: 'verifier-1', requirements: ['task'],
      verify: async ({ artifact }) => ({ verified: artifact.toString() === 'trusted' }) }] },
    createIsolatedWorld: async ({ arm: selected }) => ({ worldId: selected.worldId, isolationId: selected.isolationId }),
    runWorld: async () => ({ status: 'completed', evidence: [{ requirement: 'task', verifierId: 'verifier-1', artifactRef: 'artifact' }] }),
    artifactReader: async () => Buffer.from('trusted') });
  assert.equal(result.assessment.status, 'ready_for_independent_review');
  assert.equal(result.promotionAllowed, false);
  await assert.rejects(nursery.run({ db, verifierRegistry: { trustSource: 'candidate', verifiers: [] } }), /adapters-required/);
  await db.close();
  console.log('GVX experimental nursery checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
