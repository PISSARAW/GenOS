'use strict';

process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= 'competitive-campaign-test-secret';
const assert = require('node:assert/strict');
const receipts = require('../src/services/epistemicVerifierReceiptService');
const trusted = require('../src/services/verifierTrustRegistry');
const campaign = require('../src/services/morphogenesis/competitiveCampaignEvaluator');

function sign(resultId, evidenceDigest, workspaceId) {
  return receipts.issueReceipt({ resultId, evidenceDigest, status: 'verified', independent: true,
    verifierDigest: trusted.getVerifier('benchmark').digest,
    independenceDescriptor: { actorId: `campaign-verifier:${workspaceId}`, workspaceId } });
}

function observation(task, system, quality) {
  const id = `${task}-${system}`;
  const row = { id, taskId: task, seed: Number(task.split('-')[1]), system, quality,
    tokens: 100, latencyMs: 50, budgetTokens: 200, latencyBudgetMs: 100,
    modelId: 'common-model', toolPolicyHash: 'common-tools',
    datasetDigest: `sha256:${'a'.repeat(64)}`, adapterDigest: `sha256:${'b'.repeat(64)}`,
    runtimeVersion: `${system}-1.0` };
  row.executionReceipt = sign(id, campaign.digest(campaign.observationBody(row)), `exec-${id}`);
  row.oracleReceipt = sign(`${id}:oracle`, campaign.digest({ id, taskId: task,
    quality, datasetDigest: row.datasetDigest }), `oracle-${id}`);
  return row;
}

const empty = campaign.evaluate({ schemaVersion: campaign.SCHEMA, observations: [] });
assert.equal(empty.status, 'not_observed');
assert.equal(empty.claimable, false);

const observations = [];
for (let index = 0; index < campaign.MIN_TASKS; index += 1) {
  for (const system of campaign.SYSTEMS) {
    observations.push(observation(`task-${index}`, system, system === 'genos' ? 0.9 : 0.5));
  }
}
const qualified = campaign.evaluate({ schemaVersion: campaign.SCHEMA, observations });
assert.equal(qualified.status, 'qualified');
assert.equal(qualified.claimable, true);
assert.equal(qualified.comparisons.length, 4);

observations[0].quality = 0;
const tampered = campaign.evaluate({ schemaVersion: campaign.SCHEMA, observations });
assert.equal(tampered.status, 'not_observed', 'tampering removes the common verified task');
console.log('Morphogenesis competitive campaign common-contract gate: PASS');
