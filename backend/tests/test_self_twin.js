'use strict';

const assert = require('assert');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateGvxLedger } = require('../src/db/migrations/migrateGvxLedger');
const twin = require('../src/services/selfTwin/selfTwinService');
const { manifest, project } = require('../src/services/selfTwin/selfTwinGraph');
const { SQLiteGraphRepository } = require('../src/storage/graph/graphRepository');

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateGvxLedger(db);
    const scope = { organizationId: 'org', projectId: 'project', entityId: 'agent' };
    const prediction = await twin.predict({ db, scope, input: { target: 'agow', intervention: 'disable' } });
    assert.strictEqual(prediction.evidenceClass, 'prior_model');
    const observation = await twin.observe({ db, scope, predictionId: prediction.predictionId,
      observations: [{ metric: 'latency', predicted: 10, observed: 15 }], evidenceRefs: ['artifact:1'] });
    assert.strictEqual(observation.discrepancy.status, 'measured');
    assert.ok(observation.discrepancy.epsilon > 0);
    assert.strictEqual(observation.agowCandidate.content.semanticType, 'self_twin_prediction_error');
    const events = await require('../src/services/gvxDevelopmentLedger').listEvents(db, { ...scope });
    assert.strictEqual(events.length, 3);
    assert.deepStrictEqual((await twin.intervene({ db, scope, input: { target: 'agow', intervention: 'sandboxed_change' },
      executor: async () => ({ observations: [{ metric: 'x', predicted: 1, observed: 1 }] }) })).record.discrepancy.epsilon, 0);
  } finally { await db.close(); }
  const data = manifest();
  assert.ok(data.nodes.length >= 5);
  assert.ok(data.edges.every((edge) => edge.properties.status === 'structural_hypothesis'));
  assert.deepStrictEqual(await project(new SQLiteGraphRepository({}), data), { projected: false, backend: 'sqlite-canonical-only' });
  console.log('Self-Twin checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
