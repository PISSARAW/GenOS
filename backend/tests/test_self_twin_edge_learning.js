'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const learning = require('../src/services/selfTwin/selfTwinEdgeLearningService');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const scope = { organizationId: 'org', projectId: 'project', entityId: 'agent' };
  try {
    await migrateGvxLedger(db);
    const common = { source: 'active_query', target: 'agow', relation: 'influences',
      design: 'randomized_controlled', isolationVerified: true, controlEffect: 0.1,
      minimumDetectableEffect: 0.05, evidenceRefs: ['artifact:one'] };
    assert.equal((await learning.recordOutcome({ db, scope, input: { ...common, effect: 0.8 } })).status, 'correlated');
    const supported = await learning.recordOutcome({ db, scope, input: { ...common, effect: 0.9,
      evidenceRefs: ['artifact:two'] } });
    assert.equal(supported.status, 'causally_supported');
    assert.equal(supported.supportCount, 2);
    assert.ok(supported.effectDistribution.variance > 0);
    const nullEffect = { ...common, source: 'memory', target: 'agow', relation: 'influences', effect: 0.1,
      controlEffect: 0.1 };
    await learning.recordOutcome({ db, scope, input: nullEffect });
    const refuted = await learning.recordOutcome({ db, scope, input: { ...nullEffect,
      evidenceRefs: ['artifact:three'] } });
    assert.equal(refuted.status, 'causally_refuted');
    assert.equal((await learning.listEdges(db, scope)).length, 2);
    assert.throws(() => learning.validateInput({ source: 'x' }), /requires identity/);
  } finally { await db.close(); }
  console.log('Self-Twin controlled edge-learning checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
