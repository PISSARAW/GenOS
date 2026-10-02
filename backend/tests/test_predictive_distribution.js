'use strict';

const assert = require('node:assert/strict');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const distribution = require('../src/services/predictiveTimescale/predictiveDistributionService');
const registry = require('../src/services/predictiveTimescale/predictiveModelRegistry');
const precision = require('../src/services/predictiveTimescale/precisionLearningService');
const { migrateAdaptiveState } = require('../src/db/migrations/migrateAdaptiveState');

async function main() {
  assert.deepEqual(registry.list(), ['deterministic', 'bayesian_gaussian', 'learned_local', 'external_model']);
  const deterministic = await distribution.predict({ modelId: 'deterministic', timescale: 'T0',
    state: { latency: 200, ignored: 'x' }, context: { evidenceRefs: ['receipt:1'] } });
  assert.equal(deterministic.mean.latency, 200);
  assert.equal(deterministic.covariance.latency, 0);
  const gaussian = await distribution.predict({ modelId: 'bayesian_gaussian', timescale: 'T2', state: {},
    context: { priorMeans: { latency: 200 }, priorVariances: { latency: 400 } } });
  assert.equal(gaussian.uncertainty, 400);
  await assert.rejects(() => distribution.predict({ modelId: 'external_model', timescale: 'T0', state: {}, context: {} }),
    /adapter is required/);
  await checkPrecision();
  console.log('Predictive model adapters and precision calibration checks passed.');
}

async function checkPrecision() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await migrateAdaptiveState(db);
    const options = { db, agentId: 'agent', input: { modelId: 'bayesian_gaussian', timescale: 'T0',
      contextKey: 'network', mean: 200, variance: 400, observed: 210 } };
    const calibrated = await precision.record(options);
    assert.equal(calibrated.sampleCount, 1);
    assert.ok(calibrated.coverage95 > 0.9);
    const surprising = await precision.record({ ...options, input: { ...options.input, observed: 900 } });
    assert.ok(surprising.meanNll > calibrated.meanNll);
    assert.ok(surprising.precision < calibrated.precision);
  } finally { await db.close(); }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
