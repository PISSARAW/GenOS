'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const service = require('../src/services/consciousnessEvidence/experimentRegistryService');

const root = path.resolve(__dirname, '../..');
const registrySchema = require(path.join(root, 'spec/consciousness-experiment-registry.schema.json'));
const manifestSchema = require(path.join(root, 'spec/consciousness-experiment-manifest.schema.json'));
const registry = service.getRegistry();
const ajv = new Ajv2020({ strict: false });
ajv.addSchema(registrySchema);

assert.equal(ajv.validate(registrySchema, registry), true, JSON.stringify(ajv.errors));
assert.deepEqual(registry.theories.map((theory) => theory.id), [
  'gnwt', 'rpt', 'hot', 'predictive-processing', 'interoception', 'iit-proxy'
]);

const hypotheses = registry.theories.flatMap((theory) => theory.hypotheses);
assert.equal(hypotheses.length, 6);
for (const hypothesis of hypotheses) {
  assert.ok(hypothesis.control);
  assert.ok(hypothesis.ablation);
  assert.ok(hypothesis.primaryOutcome.metric);
  assert.ok(hypothesis.invalidationCondition);
  assert.ok(hypothesis.limitations.length > 0);
}
assert.equal(registry.constraints.phenomenalInferenceAllowed, false);
assert.equal(registry.constraints.promotionAllowed, false);

const manifest = service.createManifest({
  hypothesisId: 'gnwt-selective-broadcast',
  profileId: 'node-runtime',
  revision: '6210994cbb714956ea781302cc1b2bfa3ac742bc',
  seeds: [7, 11, 19],
  locks: { model: 'fixture-model', toolset: 'fixture-tools-v1', budget: 100 },
  thresholds: { minimumEffect: 0.05, confoundTolerance: 0.01 }
});
assert.equal(ajv.validate(manifestSchema, manifest), true, JSON.stringify(ajv.errors));
assert.equal(manifest.status, 'specified');
assert.equal(manifest.claimBoundary.phenomenalExperience, 'unassessed');
assert.equal(manifest.claimBoundary.promotionAllowed, false);

const duplicate = structuredClone(registry);
duplicate.theories[1].hypotheses[0].id = duplicate.theories[0].hypotheses[0].id;
assert.throws(() => service.validateRegistry(duplicate), /duplicate ID/);
const unknown = structuredClone(registry);
unknown.theories[0].hypotheses[0].indicatorIds.push('UNKNOWN');
assert.throws(() => service.validateRegistry(unknown), /unknown registry reference/);
assert.throws(() => service.createManifest({
  hypothesisId: 'gnwt-selective-broadcast',
  profileId: 'composed-perceptual',
  revision: 'fixture',
  seeds: [1],
  locks: { model: 'm', toolset: 't', budget: 1 },
  thresholds: { minimumEffect: 0.1, confoundTolerance: 0 }
}), /not available/);

registry.theories.pop();
assert.equal(service.getRegistry().theories.length, 6, 'callers cannot mutate the catalog');
console.log('Consciousness experiment registry: six falsifiable protocols and fail-closed manifests passed.');
