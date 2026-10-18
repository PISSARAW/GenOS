'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const experiments = require('../src/services/consciousnessEvidence/experimentRegistryService');
const comparison = require('../src/services/consciousnessEvidence/theoryComparisonService');

const root = path.resolve(__dirname, '../..');
const registrySchema = require(path.join(root, 'spec/consciousness-experiment-registry.schema.json'));
const manifestSchema = require(path.join(root, 'spec/consciousness-experiment-manifest.schema.json'));
const inputSchema = require(path.join(root, 'spec/consciousness-theory-comparison.schema.json'));
const resultSchema = require(path.join(root, 'spec/consciousness-theory-comparison-result.schema.json'));
const ajv = new Ajv2020({ strict: false });
ajv.addSchema(registrySchema);
ajv.addSchema(manifestSchema);

const hypothesisIds = experiments.getRegistry().theories.flatMap((theory) =>
  theory.hypotheses.map((hypothesis) => hypothesis.id));

function manifest(hypothesisId) {
  return experiments.createManifest({
    hypothesisId,
    profileId: 'node-runtime',
    revision: '67e1099c027428d74ab1496c54406df0ddb6e505',
    seeds: [17, 31, 47],
    locks: { model: 'fixture-model', toolset: 'fixture-tools-v1', budget: 100 },
    thresholds: { minimumEffect: 0.1, confoundTolerance: 0.05 }
  });
}

function architecture(architectureId, hashChar, changedStatus = false) {
  return {
    architectureId,
    configurationHash: hashChar.repeat(64),
    observations: hypothesisIds.map((hypothesisId, index) => {
      const notRun = changedStatus && index === 2;
      const invalidated = changedStatus && index === 0;
      return {
        manifest: manifest(hypothesisId),
        resultHash: (index + 1).toString(16).repeat(64),
        status: notRun ? 'not_run' : invalidated ? 'invalidated' : 'supported',
        primaryEffect: notRun ? null : invalidated ? 0.02 : 0.25,
        evidenceRefs: [`artifact://${architectureId}/${hypothesisId}`]
      };
    })
  };
}

const input = {
  schema: 'genos.consciousness-theory-comparison/v1',
  comparisonId: 'architecture-comparison-fixture',
  architectures: [architecture('architecture-a', 'a'), architecture('architecture-b', 'b', true)]
};
assert.equal(ajv.validate(inputSchema, input), true, JSON.stringify(ajv.errors));

const result = comparison.compare(input);
assert.equal(ajv.validate(resultSchema, result), true, JSON.stringify(ajv.errors));
assert.equal(result.comparable, true);
assert.equal(result.matrix.length, 6);
assert.equal(result.matrix[0].agreement, false);
assert.deepEqual(result.coverage.map((item) => item.observedCount), [6, 5]);
assert.equal(result.rankedWinner, null);
assert.equal(result.aggregateConsciousnessScore, null);
assert.equal(result.epistemicBoundary.phenomenalExperience, 'unassessed');
assert.equal(result.promotionAllowed, false);

const missingHypothesis = structuredClone(input);
missingHypothesis.architectures[0].observations.pop();
assert.throws(() => comparison.compare(missingHypothesis), /cover every registered hypothesis/);
const alteredManifest = structuredClone(input);
alteredManifest.architectures[1].observations[0].manifest.protocol.control = 'Changed after preregistration.';
assert.throws(() => comparison.compare(alteredManifest), /manifest was altered/);
const mismatchedLocks = structuredClone(input);
mismatchedLocks.architectures[1].observations[0].manifest.locks.budget = 90;
assert.throws(() => comparison.compare(mismatchedLocks), /share revision, profile, seeds and locks/);
const duplicateConfiguration = structuredClone(input);
duplicateConfiguration.architectures[1].configurationHash = 'a'.repeat(64);
assert.throws(() => comparison.compare(duplicateConfiguration), /configurations must be distinct/);
const missingEffect = structuredClone(input);
missingEffect.architectures[0].observations[0].primaryEffect = null;
assert.throws(() => comparison.compare(missingEffect), /finite primaryEffect/);

console.log('Consciousness theory comparison: matched contracts, full coverage and non-ranking boundary passed.');
