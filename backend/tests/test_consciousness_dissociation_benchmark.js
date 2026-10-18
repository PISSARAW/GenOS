'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const benchmark = require('../src/services/consciousnessEvidence/dissociationBenchmarkService');

const root = path.resolve(__dirname, '../..');
const inputSchema = require(path.join(root, 'spec/consciousness-dissociation-suite.schema.json'));
const resultSchema = require(path.join(root, 'spec/consciousness-dissociation-result.schema.json'));
const ajv = new Ajv2020({ strict: false });
ajv.addSchema(inputSchema);

const locks = { model: 'fixture-model', toolset: 'fixture-tools-v1', budget: 100 };
const measures = {
  'matched-perception-control': [true, 0.9, true, false],
  'processing-without-report': [true, 0.8, false, false],
  'report-without-current-stimulus': [false, 0.5, true, true],
  'null-control': [false, 0.5, false, false]
};
const observations = Object.entries(measures).map(([scenarioId, values], index) => ({
  scenarioId,
  runId: `run-${index + 1}`,
  seed: 17,
  locks: { ...locks },
  measures: {
    stimulusPresent: values[0], taskPerformance: values[1],
    reportAvailable: values[2], internallyGeneratedContent: values[3]
  },
  evidenceRefs: [`artifact://run-${index + 1}`]
}));
const input = {
  schema: 'genos.consciousness-dissociation-suite/v1',
  protocolId: 'functional-dissociation-fixture',
  revision: '83372842c279ed7002371acfd66a74970e7253e2',
  thresholds: { chanceLevel: 0.5, minimumAdvantage: 0.1 },
  observations
};

assert.equal(ajv.validate(inputSchema, input), true, JSON.stringify(ajv.errors));
const result = benchmark.assessSuite(input);
assert.equal(ajv.validate(resultSchema, result), true, JSON.stringify(ajv.errors));
assert.equal(result.status, 'prediction_supported');
assert.deepEqual(result.dissociations, {
  processingWithoutReport: true,
  reportWithoutCurrentStimulus: true
});
assert.equal(result.reportTextUsed, false);
assert.equal(result.promotionAllowed, false);
assert.equal(result.epistemicBoundary.phenomenalExperience, 'unassessed');

const contradictory = structuredClone(input);
contradictory.observations[1].measures.taskPerformance = 0.5;
const contradiction = benchmark.assessSuite(contradictory);
assert.equal(contradiction.status, 'prediction_not_supported');
assert.deepEqual(contradiction.assessments[1].mismatches, ['aboveChancePerformance']);

const textContaminated = structuredClone(input);
textContaminated.observations[0].reportText = 'I saw it';
assert.throws(() => benchmark.assessSuite(textContaminated), /Report text field/);
const unlocked = structuredClone(input);
unlocked.observations[3].locks.budget = 99;
assert.throws(() => benchmark.assessSuite(unlocked), /share seed and locks/);
const incomplete = structuredClone(input);
incomplete.observations.pop();
assert.throws(() => benchmark.assessSuite(incomplete), /each registered scenario exactly once/);

const catalog = benchmark.getRegistry();
assert.equal(catalog.scenarios.length, 4);
assert.equal(catalog.constraints.phenomenalInferenceAllowed, false);
catalog.scenarios.pop();
assert.equal(benchmark.getRegistry().scenarios.length, 4);
console.log('Consciousness dissociation benchmark: paired no-report controls and boundaries passed.');
