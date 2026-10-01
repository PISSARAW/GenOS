'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateAdaptiveState } = require('../src/db/migrations/migrateAdaptiveState');
const bridge = require('../src/services/runtimePredictiveBridgeService');
const timescale = require('../src/services/predictiveTimescale/predictiveTimescaleService');

assert.equal(bridge.mappedLevel('PERCEPTION_OBSERVED'), 'T0');
assert.equal(bridge.mappedLevel('WORKER_TASK_COMPLETED'), 'T1');
assert.equal(bridge.mappedLevel('MISSION_COMPLETED'), 'T3');
assert.equal(bridge.mappedLevel('UNRELATED'), null);
assert.deepEqual(bridge.numericPairs({ payload: { predictedMetrics: { latency: 2 }, metrics: { latency: 3 } } }), [
  { metric: 'latency', prediction: 2, observation: 3 }
]);

async function main() {
  assert.deepEqual(await bridge.trustedEvidenceRefs({}, { evidenceRefs: ['fake'] }), []);
  const provenanceHash = 'c'.repeat(64);
  const evidenceLookup = async (...args) => {
    const [, hash, organizationId, projectId] = args;
    return hash === provenanceHash && organizationId === 'org-a' && projectId === 'project-a' ? { id: 'proof' } : null;
  };
  const scopedDb = { get: evidenceLookup };
  assert.deepEqual(await bridge.trustedEvidenceRefs({ db: scopedDb,
    normalizedMission: { organizationId: 'org-a', projectId: 'project-a' } }, { evidenceRefs: [provenanceHash] }), [provenanceHash]);
  const ctx = { verifyEvidenceRefs: async () => [{ verified: true, artifactHash: 'a'.repeat(64) },
    { verified: false, artifactHash: 'b'.repeat(64) }, { verified: true, artifactHash: 'malformed' }] };
  assert.deepEqual(await bridge.trustedEvidenceRefs(ctx, { evidenceRefs: ['one', 'two', 'three'] }), ['a'.repeat(64)]);
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await migrateAdaptiveState(db);
  const event = { eventType: 'WORKER_TASK_COMPLETED', eventId: 'runtime-1', payload: {
    predictedMetrics: { latency: 2 }, metrics: { latency: 3 }, evidenceRefs: ['unverified'] } };
  const runtime = await bridge.process({ db, agentId: 'agent' }, event);
  assert.equal(runtime.status, 'recorded');
  assert.equal(runtime.predictionErrors.length, 1);
  assert.equal(runtime.predictionErrors[0].route, null);
  const state = await timescale.getState(db, 'agent');
  assert.equal(state.levels.T1.values.latency.predictionError, 1);
  await db.close();
  console.log('Runtime predictive bridge checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
