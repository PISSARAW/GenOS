'use strict';

const assert = require('node:assert/strict');
const causal = require('../src/services/conceptCausalCampaignService');
const external = require('../src/services/externalMetacognitionCampaignService');
const replication = require('../src/services/reservedReplicationCampaignService');

async function main() {
  const local = causal.runLocalCausalCampaign();
  assert.equal(local.status, 'inconclusive');
  assert.equal(local.receipt.contractType, 'CausalInterventionReceipt');
  assert.equal(local.receipt.payload.verdict, 'inconclusive');

  const missing = await external.run({ datasetId: 'SAD' });
  assert.equal(missing.status, 'not_run');
  assert.ok(missing.missing.includes('datasetReader'));

  const measured = await external.run({
    datasetId: 'MIRROR', datasetVersion: 'reserved-v1', modelVersion: 'model@locked',
    protocolVersion: 'mirror-protocol-v1', datasetReader: async () => [{ prompt: 'p' }],
    modelRunner: async (item) => ({ status: item.prompt === 'p' ? 'success' : 'failed' })
  });
  assert.equal(measured.status, 'measured');
  assert.equal(measured.promotionAllowed, false);

  const manifest = replication.buildManifest({ campaignId: 'reserved-v1', protocolId: 'p', manifestHash: 'h', seeds: [1, 2] });
  const reserved = replication.finalizeCampaign(manifest, [{ status: 'success' }, { status: 'failed' }]);
  assert.equal(reserved.replayable, true);
  assert.equal(reserved.summary.negatives, 1);
  console.log('Concept causal, external benchmark and reserved replication gates passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
