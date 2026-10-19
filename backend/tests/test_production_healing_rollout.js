'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'production-healing-rollout-test-only';

const assert = require('node:assert/strict');
const fixture = require('./ontogenesisFixture');
const store = require('../src/services/ontogenesis/projectStore');
const { registerResponsibility } = require('../src/services/shev/responsibilityService');
const { inspectProductionTelemetry } = require('../src/services/shev/adapters/productionTelemetryAdapter');
const { migrateProductionHealingCampaigns } = require('../src/db/migrations/migrateProductionHealingCampaigns');
const { migrateProductionHealingEvidence } = require('../src/db/migrations/migrateProductionHealingEvidence');
const campaigns = require('../src/services/productionHealingCampaignService');
const evidence = require('../src/services/productionHealingEvidenceService');
const rollout = require('../src/services/productionHealingRolloutService');
const { issueReceipt } = require('../src/services/epistemicVerifierReceiptService');
const trust = require('../src/services/verifierTrustRegistry');

const PROJECT = 'project-a';

async function setup(db) {
  await store.createProject(db, { id: PROJECT, rootPath: 'C:/test', branch: 'codex/test',
    objective: 'heal production', config: fixture.testConfig() });
  await registerResponsibility(db, { projectId: PROJECT, authorityRef: 'test-owner',
    mandate: { purpose: 'heal production', autoDiagnose: true, autoInstrument: false,
      dimensions: [{ name: 'availability', expected: 'SLO respected',
        acceptance: ['Restore production SLO.'] }] } });
  await db.exec(`
    CREATE TABLE telemetry_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT,
      event_type TEXT NOT NULL, payload_json TEXT, project_id TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE releases (id TEXT PRIMARY KEY, organization_id TEXT, project_id TEXT);
    CREATE TABLE release_rollouts (id TEXT PRIMARY KEY, release_id TEXT, strategy TEXT,
      config_json TEXT, status TEXT, decision_json TEXT);
  `);
  await migrateProductionHealingCampaigns(db);
  await migrateProductionHealingEvidence(db);
}

async function plannedCampaign(db) {
  await db.run(`INSERT INTO telemetry_events(event_id,event_type,payload_json,project_id)
    VALUES('prod-1','PRODUCTION_REQUEST_SUMMARY',?,?)`, [JSON.stringify({
    environment: 'production', deploymentId: 'dep-1', requests: 100,
    errors: 20, latencyMsTotal: 100000 }), PROJECT]);
  const observation = await inspectProductionTelemetry(db, { projectId: PROJECT,
    dimension: 'availability', eventType: 'PRODUCTION_REQUEST_SUMMARY', windowMs: 300000,
    maxErrorRate: 0.02, maxAverageLatencyMs: 300, minRequests: 10 });
  return campaigns.createCampaign(db, { organizationId: 'org-a', projectId: PROJECT,
    producerId: 'producer-a', observationId: observation.id });
}

function receipts(record, campaignId, candidateId) {
  const obligation = `${campaignId}:${candidateId}`;
  return ['proof', 'counterexample'].map((type, index) => issueReceipt({
    resultId: obligation, evidenceDigest: `sha256:${record.resultHash}`,
    verifierDigest: trust.ensureVerifier(type).digest, status: 'verified', independent: true,
    independenceDescriptor: { actorId: `${candidateId}-verifier-${index}`,
      workspaceId: `${candidateId}-world-${index}` }, coveredObligations: [obligation],
    evidenceTypes: ['isolated-execution-receipt', 'slo-measurements'] }));
}

async function executeCandidate(db, context) {
  const record = await evidence.recordCandidateResult(db, { ...context.scope,
    candidateId: context.candidateId, executorId: `${context.candidateId}-executor`,
    outcome: { requests: 100, errors: context.errors,
      averageLatencyMs: context.latency, costUsd: 0.1,
      evidenceRefs: [`execution:${context.candidateId}`, `metrics:${context.candidateId}`] } });
  await evidence.submitVerifications(db, { ...context.scope, candidateId: context.candidateId,
    receipts: receipts(record, context.scope.campaignId, context.candidateId) });
}

async function qualifiedCampaign(db) {
  const campaign = await plannedCampaign(db);
  const scope = { campaignId: campaign.id, organizationId: 'org-a', projectId: PROJECT };
  await executeCandidate(db, { scope, candidateId: 'no_change', errors: 20, latency: 1000 });
  await executeCandidate(db, { scope, candidateId: 'minimal_fix', errors: 1, latency: 100 });
  const decision = await evidence.qualifyCampaign(db, scope);
  assert.equal(decision.selectedCandidateId, 'minimal_fix');
  return { campaign, scope };
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    await setup(db);
    const { campaign, scope } = await qualifiedCampaign(db);
    await db.run(`INSERT INTO releases VALUES('release-a','org-a','project-a')`);
    const reference = `production-healing:${campaign.id}:minimal_fix`;
    await db.run(`INSERT INTO release_rollouts VALUES('rollout-a','release-a','canary',?,
      'running',NULL)`, [JSON.stringify({ candidateRef: reference })]);
    const bound = await rollout.bindCanary(db, { ...scope, rolloutId: 'rollout-a' });
    assert.equal(bound.status, 'canary_running');
    assert.equal((await rollout.closeCanary(db, { ...scope, rolloutId: 'rollout-a' })).pending, true);
    await db.run(`UPDATE release_rollouts SET status = 'promoted',
      decision_json = '{"status":"promoted","selectedVariant":"canary"}' WHERE id = 'rollout-a'`);
    const closed = await rollout.closeCanary(db, { ...scope, rolloutId: 'rollout-a' });
    assert.equal(closed.status, 'healed');
    assert.equal(closed.scar.outcome, 'provisionally_healed');
    assert.equal(closed.scar.causalClaim, false);
    assert.equal(closed.scar.longitudinalMonitoringRequired, true);
    assert.equal((await rollout.closeCanary(db, { ...scope, rolloutId: 'rollout-a' })).replayed, true);
    console.log('Production telemetry to provisional healing scar checks passed.');
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
