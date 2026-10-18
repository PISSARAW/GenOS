'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const experiments = require('../src/services/consciousnessEvidence/experimentRegistryService');
const benchmark = require('../src/services/consciousnessEvidence/interoceptionCausalBenchmarkService');

const root = path.resolve(__dirname, '../..');
const registrySchema = require(path.join(root, 'spec/consciousness-experiment-registry.schema.json'));
const manifestSchema = require(path.join(root, 'spec/consciousness-experiment-manifest.schema.json'));
const campaignSchema = require(path.join(root, 'spec/interoception-causal-campaign.schema.json'));
const resultSchema = require(path.join(root, 'spec/interoception-causal-result.schema.json'));
const ajv = new Ajv2020({ strict: false });
ajv.addSchema(registrySchema);
ajv.addSchema(manifestSchema);

const seeds = [11, 23, 37];
const manifest = experiments.createManifest({
  hypothesisId: 'interoception-budget-adaptation',
  profileId: 'node-runtime',
  revision: '03170a8f32ef5d10f3673d92cc6a48e28fe27bb1',
  seeds,
  locks: { model: 'fixture-model', toolset: 'fixture-tools-v1', budget: 100 },
  thresholds: { minimumEffect: 0.5, confoundTolerance: 0.05 }
});

function pair(seed) {
  return {
    seed,
    environmentHash: 'a'.repeat(64),
    limitsHash: 'b'.repeat(64),
    residualConfound: 0.01,
    control: {
      runId: `control-${seed}`,
      telemetryAccess: 'visible',
      adaptationAppliedBeforeViolation: true,
      constraintViolated: false,
      evidenceRefs: [`artifact://control-${seed}`]
    },
    ablation: {
      runId: `ablation-${seed}`,
      telemetryAccess: 'masked',
      adaptationAppliedBeforeViolation: false,
      constraintViolated: true,
      evidenceRefs: [`artifact://ablation-${seed}`]
    }
  };
}

const campaign = {
  schema: 'genos.interoception-causal-campaign/v1',
  manifest,
  pairs: seeds.map(pair)
};
assert.equal(ajv.validate(campaignSchema, campaign), true, JSON.stringify(ajv.errors));

const result = benchmark.assessCampaign(campaign);
assert.equal(ajv.validate(resultSchema, result), true, JSON.stringify(ajv.errors));
assert.equal(result.status, 'supported');
assert.equal(result.metrics.adaptationRateDelta, 1);
assert.equal(result.metrics.violationRateDelta, 1);
assert.equal(result.claim.status, 'causal_support');
assert.equal(result.claim.phenomenalExperience, 'unassessed');
assert.equal(result.promotionAllowed, false);

const invalidated = structuredClone(campaign);
invalidated.pairs.forEach((item) => {
  item.ablation.adaptationAppliedBeforeViolation = true;
  item.ablation.constraintViolated = false;
});
const invalidatedResult = benchmark.assessCampaign(invalidated);
assert.equal(invalidatedResult.status, 'invalidated');
assert.equal(invalidatedResult.claim.status, 'refuted');

const confounded = structuredClone(campaign);
confounded.pairs[0].residualConfound = 0.2;
assert.equal(benchmark.assessCampaign(confounded).status, 'confounded');
const missingSeed = structuredClone(campaign);
missingSeed.pairs[2].seed = 41;
assert.throws(() => benchmark.assessCampaign(missingSeed), /cover every manifest seed/);
const wrongArm = structuredClone(campaign);
wrongArm.pairs[0].ablation.telemetryAccess = 'visible';
assert.throws(() => benchmark.assessCampaign(wrongArm), /must be 'masked'/);
const alteredManifest = structuredClone(campaign);
alteredManifest.manifest.protocol.control = 'Changed after preregistration.';
assert.throws(() => benchmark.assessCampaign(alteredManifest), /manifest was altered/);

console.log('Interoception causal benchmark: paired outcomes, confounds and claim boundary passed.');
