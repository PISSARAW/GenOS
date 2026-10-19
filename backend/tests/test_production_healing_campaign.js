'use strict';

const assert = require('node:assert/strict');
const fixture = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { migrateProductionHealingCampaigns } = require('../src/db/migrations/migrateProductionHealingCampaigns');
const { inspectProductionTelemetry } = require('../src/services/shev/adapters/productionTelemetryAdapter');
const healing = require('../src/services/productionHealingCampaignService');

const PROJECT = 'healing-campaign-project';

async function setup(db) {
  await store.createProject(db, { id: PROJECT, rootPath: 'C:/test', branch: 'codex/test',
    objective: 'heal production', config: fixture.testConfig() });
  await registerResponsibility(db, { projectId: PROJECT, authorityRef: 'test-owner',
    mandate: { purpose: 'heal production', autoDiagnose: true, autoInstrument: false,
      dimensions: [{ name: 'availability', expected: 'SLO respected',
        acceptance: ['Restore the delegated production SLO.'] }] } });
  await db.exec(`CREATE TABLE telemetry_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT, event_type TEXT NOT NULL,
    payload_json TEXT, project_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
  await migrateProductionHealingCampaigns(db);
}

async function degradation(db) {
  await db.run(`INSERT INTO telemetry_events(event_id,event_type,payload_json,project_id)
    VALUES('prod-1','PRODUCTION_REQUEST_SUMMARY',? ,?)`, [JSON.stringify({
    environment: 'production', deploymentId: 'dep-1', requests: 100,
    errors: 20, latencyMsTotal: 100000 }), PROJECT]);
  return inspectProductionTelemetry(db, { projectId: PROJECT, dimension: 'availability',
    eventType: 'PRODUCTION_REQUEST_SUMMARY', windowMs: 300000,
    maxErrorRate: 0.02, maxAverageLatencyMs: 300, minRequests: 10 });
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    await setup(db);
    const observation = await degradation(db);
    const input = { organizationId: 'org-a', projectId: PROJECT,
      producerId: 'incident-agent', observationId: observation.id };
    const campaign = await healing.createCampaign(db, input);
    assert.equal(campaign.severity, 'critical');
    assert.equal(campaign.status, 'planned');
    assert.equal(campaign.plan.candidates.length, 4);
    assert.deepEqual(campaign.plan.candidates.map(item => item.id),
      ['no_change', 'rollback', 'minimal_fix', 'structural_fix']);
    assert.ok(campaign.plan.candidates.every(item => item.executionAuthorized === false));
    assert.equal(campaign.plan.stages.coagulation.automaticExecution, false);
    assert.equal(campaign.authorizesProductionChange, false);
    assert.equal((await healing.createCampaign(db, input)).replayed, true);
    await assert.rejects(db.run('DELETE FROM production_healing_campaigns'), /durable evidence/);
    console.log('Production healing campaign planning checks passed.');
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
