'use strict';

const assert = require('node:assert/strict');
const graph = require('../src/services/cognitiveOmegaDomainGraphService');
const compiler = require('../src/services/cognitiveOmegaCompiler');

const domain = graph.build({ domain: 'trinity', operation: 'HYPOTHESIS', objects: {
  mission: 'find causes', candidateHypotheses: ['h1'], experiment: { worlds: 3 }
} });
assert.deepEqual(domain.operations.map((operation) => operation.kind),
  ['READ', 'READ', 'READ', 'SELECT', 'CALL', 'INFER', 'CHECK']);
assert.equal(domain.objectRecords.length, 3);
assert.deepEqual(domain.objectStore['@trinity/mission'], 'find causes');
assert.equal(domain.objectRecords.every((object) => /^sha256:[a-f0-9]{64}$/.test(object.digest)), true);
assert.deepEqual(domain.operations[5].dependsOn, ['call_trinity']);
assert.deepEqual(domain.operations[6].proof, {
  required: true, method: 'reproducer', evidenceRefs: [], independent: true, binding: 'infer_trinity'
});
assert.deepEqual(domain.dependencies.select_trinity,
  ['read_mission', 'read_candidate_hypotheses', 'read_experiment']);
const effected = graph.build({ domain: 'trinity', objects: { mission: 'x' }, effects: ['promote'] });
assert.equal(effected.operations.at(-1).kind, 'EMIT');
assert.deepEqual(effected.operations.at(-1).dependsOn, ['check_trinity']);
const compiled = compiler.compilePrompt({ prompt: 'native trinity residual', domain: domain.domain,
  program: domain.operations });
assert.equal(compiled.status, 'ready');
assert.equal(compiled.mode, 'native_domain_graph');
assert.equal(compiled.plan.status, 'deferred');
assert.deepEqual(compiled.plan.residual, ['read_candidate_hypotheses', 'read_experiment', 'read_mission',
  'select_trinity', 'call_trinity', 'infer_trinity', 'check_trinity']);
console.log('G-CIR Omega domain graph checks passed.');
