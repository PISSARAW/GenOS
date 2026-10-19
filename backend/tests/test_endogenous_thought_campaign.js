'use strict';

const assert = require('node:assert/strict');
const campaign = require('../bin/genos-ett-campaign.cjs');
const executor = require('../src/services/endogenousThoughtCampaignExecutor');

async function main() {
  const options = campaign.campaignOptions();
  assert.equal(options.holdout, false);
  assert.equal(options.snapshot.corpusSplit, 'development');
  assert.deepEqual(options.snapshot.seeds, options.protocol.corpus.developmentSeeds);
  assert.equal(options.cases.length,
    options.protocol.corpus.developmentSeeds.length * options.protocol.corpus.scenarioClasses.length);

  const outcome = await executor.execute({
    caseId: 'seed-101-learnable_anomaly',
    input: { seed: 101, scenarioClass: 'learnable_anomaly' },
    condition: 'full'
  });
  assert.equal(outcome.success, true);
  assert.equal(outcome.syntheticVerdict, 'supported');
  assert.equal(outcome.learned, true);
  assert.equal(outcome.continued, true);
  assert.equal(outcome.continuationError, null);
  assert.equal(outcome.verifiedDiscoveries, 0);
  assert.equal(outcome.normalizedCost, 0);
  assert.equal(outcome.measurementStatus, 'synthetic_control_only');
  assert.equal(outcome.scientificEvidence, false);
  console.log('ETT development campaign evidence boundary checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
