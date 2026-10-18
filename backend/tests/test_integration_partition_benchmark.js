'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const experiments = require('../src/services/consciousnessEvidence/experimentRegistryService');
const benchmark = require('../src/services/consciousnessEvidence/integrationPartitionBenchmarkService');

const root = path.resolve(__dirname, '../..');
const registrySchema = require(path.join(root, 'spec/consciousness-experiment-registry.schema.json'));
const manifestSchema = require(path.join(root, 'spec/consciousness-experiment-manifest.schema.json'));
const campaignSchema = require(path.join(root, 'spec/integration-partition-campaign.schema.json'));
const resultSchema = require(path.join(root, 'spec/integration-partition-result.schema.json'));
const ajv = new Ajv2020({ strict: false });
ajv.addSchema(registrySchema);
ajv.addSchema(manifestSchema);

const seeds = [13, 29, 43];
const manifest = experiments.createManifest({
  hypothesisId: 'iit-partition-sensitivity',
  profileId: 'node-runtime',
  revision: 'd4ad92cd14549f4b26cf42718e31bf28ff8d8875',
  seeds,
  locks: { model: 'fixture-model', toolset: 'fixture-tools-v1', budget: 100 },
  thresholds: { minimumEffect: 0.2, confoundTolerance: 0.05 }
});

function arm(seed, partitioned) {
  return {
    runId: `${partitioned ? 'partitioned' : 'control'}-${seed}`,
    partitioned,
    budget: 100,
    meanDegree: 4,
    trafficVolume: partitioned ? 99 : 100,
    perturbationalIntegrationProxy: partitioned ? 0.45 : 0.75,
    evidenceRefs: [`artifact://${partitioned ? 'partitioned' : 'control'}-${seed}`]
  };
}

function pair(seed) {
  return {
    seed,
    environmentHash: 'a'.repeat(64),
    nodeSetHash: 'b'.repeat(64),
    control: arm(seed, false),
    intervention: arm(seed, true)
  };
}

const campaign = {
  schema: 'genos.integration-partition-campaign/v1',
  manifest,
  pairs: seeds.map(pair)
};
assert.equal(ajv.validate(campaignSchema, campaign), true, JSON.stringify(ajv.errors));

const result = benchmark.assessCampaign(campaign);
assert.equal(ajv.validate(resultSchema, result), true, JSON.stringify(ajv.errors));
assert.equal(result.status, 'supported');
assert.equal(result.metrics.meanProxyDelta, 0.3);
assert.equal(result.metrics.maximumDegreeDelta, 0);
assert.equal(result.metrics.maximumTrafficDelta, 0.01);
assert.equal(result.pairResults[0].proxyDelta, 0.3);
assert.equal(result.claim.status, 'causal_support');
assert.equal(result.claim.phenomenalExperience, 'unassessed');
assert.equal(result.phiComputed, false);
assert.equal(result.iitImplemented, false);
assert.equal(result.promotionAllowed, false);

const invalidated = structuredClone(campaign);
invalidated.pairs.forEach((item) => { item.intervention.perturbationalIntegrationProxy = 0.6; });
const invalidatedResult = benchmark.assessCampaign(invalidated);
assert.equal(invalidatedResult.status, 'invalidated');
assert.equal(invalidatedResult.claim.status, 'refuted');

const confounded = structuredClone(campaign);
confounded.pairs[0].intervention.meanDegree = 3;
assert.equal(benchmark.assessCampaign(confounded).status, 'confounded');
const wrongBudget = structuredClone(campaign);
wrongBudget.pairs[0].intervention.budget = 90;
assert.throws(() => benchmark.assessCampaign(wrongBudget), /budget lock/);
const wrongArm = structuredClone(campaign);
wrongArm.pairs[0].intervention.partitioned = false;
assert.throws(() => benchmark.assessCampaign(wrongArm), /partitioned must be true/);
const sharedEvidence = structuredClone(campaign);
sharedEvidence.pairs[0].intervention.evidenceRefs = sharedEvidence.pairs[0].control.evidenceRefs;
assert.throws(() => benchmark.assessCampaign(sharedEvidence), /distinct evidenceRefs/);
const missingSeed = structuredClone(campaign);
missingSeed.pairs[2].seed = 47;
assert.throws(() => benchmark.assessCampaign(missingSeed), /cover every manifest seed/);
const alteredManifest = structuredClone(campaign);
alteredManifest.manifest.protocol.control = 'Changed after preregistration.';
assert.throws(() => benchmark.assessCampaign(alteredManifest), /manifest was altered/);

console.log('Integration partition benchmark: paired proxy effect, controls and claim boundary passed.');
