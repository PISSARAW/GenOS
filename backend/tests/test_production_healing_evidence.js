'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET = 'production-healing-evidence-test-only';

const assert = require('node:assert/strict');
const fixture = require('./ontogenesisFixture');
const { migrateProductionHealingCampaigns } = require('../src/db/migrations/migrateProductionHealingCampaigns');
const { migrateProductionHealingEvidence } = require('../src/db/migrations/migrateProductionHealingEvidence');
const { issueReceipt } = require('../src/services/epistemicVerifierReceiptService');
const trust = require('../src/services/verifierTrustRegistry');
const evidence = require('../src/services/productionHealingEvidenceService');

async function setup(db) {
  await migrateProductionHealingCampaigns(db);
  await migrateProductionHealingEvidence(db);
  await db.run(`INSERT INTO shev_responsibilities(project_id) VALUES('project-a')`);
  await db.run(`INSERT INTO shev_observations
    (id,project_id,domain,dimension,kind,epistemic_status,source,observed_at,summary,evidence_json,content_hash)
    VALUES('obs-a','project-a','production-runtime','availability','degradation','observed',
    'test',CURRENT_TIMESTAMP,'degraded','["telemetry:1"]','hash')`);
  const plan = { thresholds: { maxErrorRate: 0.02, maxAverageLatencyMs: 300 }, candidates: [
    { id: 'no_change', blastRadius: 'none' }, { id: 'minimal_fix', blastRadius: 'component' }
  ] };
  await db.run(`INSERT INTO production_healing_campaigns
    (id,organization_id,project_id,observation_id,producer_id,severity,status,plan_json,plan_hash)
    VALUES('campaign-a','org-a','project-a','obs-a','producer-a','high','planned',?,?)`,
  [JSON.stringify(plan), 'plan-hash']);
}

function scope(candidateId) {
  return { campaignId: 'campaign-a', organizationId: 'org-a',
    projectId: 'project-a', candidateId };
}

async function result(db, candidateId, outcome) {
  return evidence.recordCandidateResult(db, { ...scope(candidateId),
    executorId: `executor-${candidateId}`, outcome: { requests: 100,
      evidenceRefs: [`execution:${candidateId}`, `metrics:${candidateId}`], costUsd: 0.1,
      ...outcome } });
}

function receipts(record, candidateId, actors) {
  const obligation = `campaign-a:${candidateId}`;
  return actors.map((actorId, index) => issueReceipt({ resultId: obligation,
    evidenceDigest: `sha256:${record.resultHash}`,
    verifierDigest: trust.ensureVerifier(index ? 'counterexample' : 'proof').digest,
    status: 'verified', independent: true, independenceDescriptor: { actorId,
      workspaceId: `isolated-${actorId}` }, coveredObligations: [obligation],
    evidenceTypes: ['isolated-execution-receipt', 'slo-measurements'] }));
}

async function verify(db, candidateId, record) {
  return evidence.submitVerifications(db, { ...scope(candidateId),
    receipts: receipts(record, candidateId, [`verifier-${candidateId}-a`,
      `verifier-${candidateId}-b`]) });
}

async function main() {
  const db = await fixture.memoryDb();
  try {
    await setup(db);
    const control = await result(db, 'no_change', { errors: 10, averageLatencyMs: 900 });
    const fixed = await result(db, 'minimal_fix', { errors: 1, averageLatencyMs: 100 });
    const dependent = receipts(fixed, 'minimal_fix', ['producer-a']);
    await assert.rejects(evidence.submitVerifications(db, { ...scope('minimal_fix'),
      receipts: dependent }), { code: 'PRODUCTION_HEALING_VERIFIER_NOT_INDEPENDENT' });
    const forged = receipts(fixed, 'minimal_fix', ['forged-a']);
    forged[0].status = 'refuted';
    await assert.rejects(evidence.submitVerifications(db, { ...scope('minimal_fix'),
      receipts: forged }), { code: 'PRODUCTION_HEALING_RECEIPT_INVALID' });
    await verify(db, 'no_change', control);
    await verify(db, 'minimal_fix', fixed);
    const decision = await evidence.qualifyCampaign(db, scope('minimal_fix'));
    assert.equal(decision.status, 'ready_for_canary');
    assert.equal(decision.selectedCandidateId, 'minimal_fix');
    assert.equal(decision.authorizesPromotion, false);
    assert.equal(decision.promotionEligible, false);
    await assert.rejects(db.run('DELETE FROM production_healing_verifications'), /immutable/);
    console.log('Production healing independent evidence checks passed.');
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
