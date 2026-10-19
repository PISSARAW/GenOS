'use strict';

const assert = require('node:assert/strict');
const { generateKeyPairSync, sign } = require('node:crypto');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const { migrateAdaptiveState } = require('../src/db/migrations/migrateAdaptiveState');
const envelope = require('../src/services/predictiveTimescale/worldModelEnvelope');
const ledger = require('../src/services/predictiveTimescale/worldModelLedgerService');

function signedObservation(privateKey, payload, publicKey) {
  return { payload, publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
    signature: sign(null, Buffer.from(envelope.canonical(payload)), privateKey).toString('base64') };
}

function predictionInput(overrides = {}) {
  return { predictionKey: 'deploy-latency', metric: 'latency_ms', modelId: 'release-world-v2',
    contextKey: 'production-eu', mean: 120, variance: 100,
    confidence: 0.7, falsificationTolerance: 25, actionRef: 'action:deploy-42', actionState: 'PLANNED',
    trajectoryId: 'trajectory:release-7', projectId: 'project:genos', responsibleAgentId: 'agent:release',
    assumptionIds: ['assumption:cache-hot'], evidenceRefs: ['artifact:benchmark-1'], ...overrides };
}

async function main() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  const keys = generateKeyPairSync('ed25519');
  try {
    await migrateAdaptiveState(db);
    await verifyVersionedPreregistration(db);
    await verifySignedRealityGate(db, keys);
    console.log('World-model prediction ledger checks passed.');
  } finally { await db.close(); }
}

async function verifyVersionedPreregistration(db) {
  const common = { db, agentId: 'world-agent', now: () => '2026-10-19T09:00:00.000Z' };
  const first = await ledger.preregister({ ...common, input: predictionInput(), randomId: () => 'prediction-1' });
  const second = await ledger.preregister({ ...common, input: predictionInput({ mean: 130 }), randomId: () => 'prediction-2' });
  assert.equal(first.version, 1);
  assert.equal(second.version, 2);
  assert.notEqual(first.commitment, second.commitment);
  await assert.rejects(() => ledger.preregister({ ...common,
    input: predictionInput({ actionState: 'RUNNING' }) }), /must-precede-action/);
}

async function verifySignedRealityGate(db, keys) {
  const prediction = (await ledger.getState(db, 'world-agent')).predictions['prediction-1'];
  const payload = { predictionId: prediction.predictionId, version: prediction.version, value: 170,
    observedAt: '2026-10-19T09:05:00.000Z', sourceKind: 'real_environment', synthetic: false,
    signerId: 'sensor:prod-latency', evidenceRefs: ['sha256:real-receipt'], independentRefs: ['probe:a', 'probe:b'] };
  const forged = signedObservation(keys.privateKey, { ...payload, value: 171 }, keys.publicKey);
  forged.payload = payload;
  await assert.rejects(() => ledger.observe({ db, agentId: 'world-agent', envelope: forged }), /signature-invalid/);
  const synthetic = signedObservation(keys.privateKey, { ...payload, sourceKind: 'simulation', synthetic: true }, keys.publicKey);
  await assert.rejects(() => ledger.observe({ db, agentId: 'world-agent', envelope: synthetic }), /real-observation-required/);
  const result = await ledger.observe({ db, agentId: 'world-agent',
    envelope: signedObservation(keys.privateKey, payload, keys.publicKey), observationId: 'observation-1' });
  assert.equal(result.observation.residual, 50);
  assert.equal(result.observation.predictionCommitment, prediction.commitment);
  assert.equal(result.prediction.status, 'OBSERVED');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
