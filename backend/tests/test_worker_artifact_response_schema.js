'use strict';

const assert = require('node:assert/strict');
const { workerArtifactResponseFormat } = require('../src/services/agents/workerArtifactResponseSchema');

const red = workerArtifactResponseFormat('red_worker');
assert.equal(red.name, 'genos_worker_artifact');
assert.deepEqual(red.schema.required, ['outcome', 'claims', 'workerArtifact']);
const report = red.schema.properties.workerArtifact.properties.content;
assert.deepEqual(report.properties.verdict.enum, ['accept', 'reject', 'unresolved']);
assert.ok(report.required.includes('reproductionSteps'));
assert.ok(report.properties.counterexamples.items.required.includes('evidence'));
const trinityRed = workerArtifactResponseFormat('red_worker', ['mission']).schema;
assert.deepEqual(trinityRed.properties.claims.items.properties.evidence.items.enum, ['mission']);
assert.deepEqual(trinityRed.properties.workerArtifact.properties.content.properties.evidence.items.enum, ['mission']);

const dossier = workerArtifactResponseFormat('specialist').schema;
assert.ok(dossier.required.includes('specialtyAssessment'));
assert.equal(dossier.properties.specialtyAssessment.properties.inScope.const, true);
assert.equal(dossier.properties.workerArtifact, undefined);

process.stdout.write('Worker artifacts expose provider-enforced JSON schemas: PASS\n');
