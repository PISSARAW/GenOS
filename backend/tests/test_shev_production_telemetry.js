'use strict';

const assert = require('node:assert/strict');
const fixture = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { inspectProductionTelemetry } = require('../src/services/shev/adapters/productionTelemetryAdapter');

const PROJECT = 'production-telemetry-project';
const BASE = Date.now();
const config = { projectId: PROJECT, dimension: 'availability',
  eventType: 'PRODUCTION_REQUEST_SUMMARY', windowMs: 300000,
  maxErrorRate: 0.02, maxAverageLatencyMs: 300, minRequests: 10 };

async function setup(db) {
  await store.createProject(db, { id: PROJECT, rootPath: 'C:/test', branch: 'codex/test',
    objective: 'observe production', config: fixture.testConfig() });
  await registerResponsibility(db, { projectId: PROJECT, authorityRef: 'test-owner',
    mandate: { purpose: 'observe production', autoDiagnose: true, autoInstrument: false,
      dimensions: [{ name: 'availability', expected: 'SLO respected',
        acceptance: ['Production telemetry remains within the delegated SLO.'] }] } });
  await db.exec(`CREATE TABLE telemetry_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT, event_type TEXT NOT NULL,
    payload_json TEXT, project_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
}

async function addSample(db, id, payload) {
  await db.run(`INSERT INTO telemetry_events(event_id,event_type,payload_json,project_id,created_at)
    VALUES(?,?,?,?,?)`, [id, config.eventType, JSON.stringify(payload), PROJECT,
    new Date(BASE - 1000).toISOString()]);
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    await setup(db);
    const missing = await inspectProductionTelemetry(db, { ...config, nowMs: BASE });
    assert.equal(missing.kind, 'blind_spot');
    assert.equal(missing.epistemicStatus, 'unknown');

    await addSample(db, 'healthy', { environment: 'production', deploymentId: 'dep-a',
      requests: 100, errors: 1, latencyMsTotal: 10000 });
    const healthy = await inspectProductionTelemetry(db, { ...config, nowMs: BASE,
      sampleRef: 'healthy' });
    assert.equal(healthy.kind, 'state');

    await addSample(db, 'degraded', { environment: 'production', deploymentId: 'dep-a',
      requests: 100, errors: 10, latencyMsTotal: 100000 });
    const degraded = await inspectProductionTelemetry(db, { ...config, nowMs: BASE,
      sampleRef: 'degraded' });
    assert.equal(degraded.kind, 'degradation');
    assert.equal(JSON.parse((await db.get('SELECT evidence_json FROM shev_observations WHERE id = ?',
      degraded.id)).evidence_json).length, 2);

    await addSample(db, 'staging', { environment: 'staging', requests: 1000,
      errors: 1000, latencyMsTotal: 1000000 });
    const deployment = await inspectProductionTelemetry(db, { ...config,
      deploymentId: 'dep-a', nowMs: BASE + 1 });
    assert.equal(deployment.kind, 'degradation');
    console.log('SHEV production telemetry nociception checks passed.');
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
