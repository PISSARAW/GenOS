'use strict';

const assert = require('node:assert/strict');
const organismService = require('../src/services/missionOrganismService');
const { ingestSecurityAlerts } = require('../src/services/securityRemediation/securityAlertContract');
const { buildAntigenGraph } = require('../src/services/securityRemediation/antigenGraphService');
const { planRemediationCampaign } = require('../src/services/securityRemediation/remediationCampaignPlanner');
const adjudicator = require('../src/services/securityRemediation/campaignAdjudicator');

function checks(kind, diffLines) {
  const control = kind === 'control';
  return { scannerOutcome: control ? 'present' : 'cleared',
    safePathReproduction: control ? 'reachable' : 'blocked',
    functionalInvariants: 'passed', newHazards: 'none',
    metrics: { remainingAlerts: control ? 2 : 0, invariantFailures: 0,
      newHazards: 0, diffLines } };
}

function receipts(candidate, options) {
  return ['verifier-a', 'verifier-b'].map((verifierId) => adjudicator.createVerifierReceipt({
    candidateId: candidate.id, verifierId, status: options.status || 'verified',
    evidenceRef: `test://safe-fixture/${candidate.id}/${verifierId}`,
    checks: checks(options.kind, options.diffLines) }));
}

const batch = ingestSecurityAlerts({ alerts: [
  { externalId: 'sql-a', ruleId: 'codeql/sql', cwes: ['CWE-89'],
    trustBoundary: 'http-to-db', sourceKind: 'request', sinkKind: 'sql',
    message: 'Unsafe SQL flow.', location: { path: 'src/users.js', line: 8 } },
  { externalId: 'sql-b', ruleId: 'semgrep/sql', cwes: ['CWE-89'],
    trustBoundary: 'http-to-db', sourceKind: 'request', sinkKind: 'sql',
    message: 'Unsafe SQL flow.', location: { path: 'src/orders.js', line: 12 } }
] });
const graph = buildAntigenGraph(batch);
const campaign = planRemediationCampaign(graph, { sourceDigest: 'sha256:fixture-revision',
  producerId: 'patch-producer', campaignSeed: 'e2e' });
const byFamily = Object.fromEntries(campaign.candidates.map((item) => [item.family, item]));
const allReceipts = [...receipts(byFamily.control, { kind: 'control', diffLines: 0 }),
  ...receipts(byFamily.minimal_patch,
    { kind: 'candidate', diffLines: 4, status: 'refuted' }),
  ...receipts(byFamily.structural_fix, { kind: 'candidate', diffLines: 12 }),
  ...receipts(byFamily.compensating_control, { kind: 'candidate', diffLines: 20 })];
const result = adjudicator.adjudicateCampaign(campaign, allReceipts);
assert.equal(result.recommendations.length, 1);
assert.equal(result.recommendations[0].family, 'structural_fix');
assert.equal(result.recommendations[0].promotionEligible, false);
assert.equal(result.requiresExistingPromotionGate, true);

const dossier = adjudicator.evidenceDossierProjection(result);
assert.equal(dossier.claims.length, 1);
assert.equal(dossier.evidence.length, 2);
assert.equal(dossier.policy.minIndependentVerifiers, 2);
assert.equal(dossier.promotionEligible, false);

const organism = organismService.newOrganism({ id: 'security-organism',
  genome: { objective: 'Remediate synthetic alerts.' } });
const remembered = adjudicator.enrollRejectedCandidates(organism, result);
assert.equal(remembered.memory.failedStrategies.length, 1);
assert.equal(remembered.memory.failedStrategies[0].strategy, 'minimal_patch');

const forged = { ...allReceipts[0], receiptHash: '0'.repeat(64) };
assert.throws(() => adjudicator.adjudicateCampaign(campaign, [forged]),
{ code: 'SECURITY_VERIFIER_RECEIPT_INVALID' });

process.stdout.write('Synthetic security campaign closes with independent evidence and negative memory.\n');
