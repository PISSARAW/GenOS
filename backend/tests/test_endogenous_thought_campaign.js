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
  assert(options.cases.every((item) => item.input.problem.problemId));
  assert.equal(new Set(options.cases.map((item) => item.input.problem.problemId)).size,
    options.protocol.corpus.scenarioClasses.length);

  const campaignCase = options.cases.find((item) => item.input.scenarioClass === 'learnable_anomaly');
  const outcome = await executor.execute({
    ...campaignCase,
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
  assert.equal(outcome.developmentUtility, 1);
  assert.equal(outcome.terminalState, 'STOPPED');

  const conditions = Object.fromEntries(await Promise.all(options.protocol.conditions
    .filter((condition) => condition !== 'full')
    .map(async (condition) => [condition, await executor.execute({
      ...campaignCase, condition
    })])));
  assert.deepEqual(conditions.planned_control.plannedControl, {
    planId: 'ett-planned-abstention-v1', action: 'bounded_abstention', executed: true
  });
  assert.equal(conditions.curiosity_ablated.decisionReason, 'below-threshold');
  assert.equal(conditions.shev_initiative_ablated.decisionReason, 'shev-initiative-ablated');
  assert.equal(conditions.agow_arbitration_ablated.terminalState, 'ABSTAINED');
  assert.equal(conditions.metacognition_ablated.terminalState, 'VERIFIED');
  assert.equal(conditions.metacognition_ablated.learned, false);
  assert.equal(conditions.memory_ablated.terminalState, 'LEARNED');
  assert.equal(conditions.memory_ablated.continued, false);
  assert(Object.values(conditions).every((item) => item.scientificEvidence === false));
  console.log('ETT development campaign evidence boundary checks passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
