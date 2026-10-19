'use strict';

const assert = require('node:assert/strict');
const fixture = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { openEpisode } = require('../src/services/shev/healingEpisodeService');
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
    payload_json TEXT, project_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE IF NOT EXISTS clinical_states (agent_id TEXT, vitals_json TEXT,
      immune_titer REAL, inflammatory_index REAL, cell_cycle_state TEXT, plasmid_load REAL,
      pathogen_burden REAL, iatrogenic_load REAL, wellness_score REAL, updated_at TEXT);
    CREATE TABLE IF NOT EXISTS pathologies (agent_id TEXT, id TEXT, pathology_type TEXT,
      severity REAL, confidence REAL, status TEXT, evidence_json TEXT, detected_at TEXT);`);
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
    await openEpisode(db, { projectId: PROJECT, observationId: observation.id });
    await db.run('INSERT INTO agents (id,status) VALUES (?,?)', ['incident-agent', 'active']);
    await db.run(`INSERT INTO clinical_states (agent_id,vitals_json,immune_titer,inflammatory_index,
      cell_cycle_state,plasmid_load,pathogen_burden,iatrogenic_load,wellness_score,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)`, ['incident-agent', '{}', 0, 0, 'G1', 0, 0, 0, 0.8,
      new Date().toISOString()]);
    await db.run(`INSERT INTO pathologies (agent_id,id,pathology_type,severity,confidence,status,
      evidence_json,detected_at) VALUES (?,?,?,?,?,?,?,?)`, ['incident-agent', 'drift-1',
      'mutation_drift', 0.8, 0.9, 'confirmed', '[]', new Date().toISOString()]);
    const input = { organizationId: 'org-a', projectId: PROJECT,
      producerId: 'incident-agent', observationId: observation.id };
    const campaign = await healing.createCampaign(db, input);
    assert.equal(campaign.severity, 'critical');
    assert.equal(campaign.status, 'planned');
    assert.equal(campaign.plan.candidates.length, 5);
    assert.deepEqual(campaign.plan.candidates.map(item => item.id),
      ['no_change', 'rollback', 'minimal_fix', 'structural_fix', 'inherited_source_repair']);
    assert.ok(campaign.plan.candidates.every(item => item.executionAuthorized === false));
    assert.equal(campaign.plan.nosology.primaryFamily, 'genetic');
    assert.ok(campaign.plan.candidates.some(item => item.id === 'inherited_source_repair'));
    assert.equal(campaign.plan.stages.coagulation.automaticExecution, false);
    assert.equal(campaign.authorizesProductionChange, false);
    const enriched = healing.planFor({ observation: { id: 'lesion' },
      window: { evidence_digest: 'sha256:window' }, metrics: { errorRate: 0.2,
        averageLatencyMs: 500 }, policy: { maxErrorRate: 0.02, maxAverageLatencyMs: 300 } }, {
      schema: 'genos.shev-morphogenesis-healing-plan/v1', primaryFamily: 'metabolic',
      recommendedControl: 'resource_reallocation', candidateScale: 'RESOURCE_REALLOCATION',
      candidates: [{ id: 'resource_reallocation', action: 'resource_reallocation', family: 'metabolic',
        executionAuthorized: false }], proofObligations: [], requiresExplicitAuthorization: true,
      promotionEligible: false });
    assert.equal(enriched.plan.nosology.primaryFamily, 'metabolic');
    assert.equal(enriched.plan.candidates.at(-1).executionAuthorized, false);
    assert.equal(enriched.plan.authorizesProductionChange, false);
    assert.equal((await healing.createCampaign(db, input)).replayed, true);
    await assert.rejects(db.run('DELETE FROM production_healing_campaigns'), /durable evidence/);
    console.log('Production healing campaign planning checks passed.');
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
