'use strict';

const assert = require('node:assert/strict');
const { ingestSecurityAlerts } = require('../src/services/securityRemediation/securityAlertContract');
const { buildAntigenGraph } = require('../src/services/securityRemediation/antigenGraphService');
const { planRemediationCampaign } = require('../src/services/securityRemediation/remediationCampaignPlanner');
const effector = require('../src/services/securityRemediation/immuneEffectorService');

const campaign = planRemediationCampaign(buildAntigenGraph(ingestSecurityAlerts({ alerts: [{
  externalId: 'alert', ruleId: 'sql-injection', cwes: ['CWE-89'], trustBoundary: 'http-db',
  sourceKind: 'request', sinkKind: 'sql', message: 'unsafe flow',
  location: { path: 'src/db.js', line: 3 }
}] })), { sourceDigest: 'sha256:source', producerId: 'producer' });

async function main() {
  let canaryCandidate;
  const result = await effector.executeCampaign({ campaign, authorization: {
    requiresExplicitAuthorization: true },
  verifyAuthorization: async () => ({ authorized: true, evidenceRef: 'auth:campaign' }),
  createNursery: async ({ candidate }) => ({ id: `nursery:${candidate.id}`, isolated: true,
    workspaceId: candidate.isolation.workspaceId, sourceDigest: candidate.isolation.sourceDigest,
    network: 'disabled' }),
  applyCandidate: async ({ candidate }) => ({ candidateId: candidate.id, changed: true }),
  runLocalOracles: async ({ candidate }) => ({ evidenceRef: `oracle:${candidate.id}`,
    checks: checks(candidate.family === 'control') }),
  verifyIndependently: async ({ candidate }) => ['verifier-a', 'verifier-b'].map((verifierId) => ({
    verifierId, evidenceRef: `verified:${verifierId}:${candidate.id}`,
    checks: checks(candidate.family === 'control') })),
  canaryGate: async ({ recommendation }) => { canaryCandidate = recommendation.candidateId; return { admitted: true }; }
  });
  assert.equal(result.adjudication.recommendations.length, 1);
  assert.equal(result.winner, canaryCandidate);
  assert.equal(result.canaryAdmission.admitted, true);
  assert.equal(result.promotionEligible, false);
  await assert.rejects(effector.executeCampaign({ campaign, authorization: {} }), /explicit-authorization-required/);
  await assert.rejects(effector.executeCampaign({ campaign: { ...campaign,
    candidates: campaign.candidates.slice(1) }, authorization: { requiresExplicitAuthorization: true },
  verifyAuthorization: async () => ({ authorized: true, evidenceRef: 'auth:test' }) }),
  /SECURITY_REMEDIATION_CAMPAIGN_REQUIRED/);
  console.log('Immune effector nursery, oracle, quorum, and canary-gate checks passed.');
}

function checks(control) {
  return { scannerOutcome: control ? 'present' : 'cleared',
    safePathReproduction: control ? 'reachable' : 'blocked',
    functionalInvariants: 'passed', newHazards: 'none',
    metrics: { remainingAlerts: control ? 5 : 0, invariantFailures: 0,
      newHazards: 0, diffLines: control ? 0 : 2 } };
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
