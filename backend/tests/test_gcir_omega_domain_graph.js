'use strict';

const assert = require('node:assert/strict');
const graph = require('../src/services/cognitiveOmegaDomainGraphService');
const compiler = require('../src/services/cognitiveOmegaCompiler');

const domain = graph.build({ domain: 'trinity', operation: 'HYPOTHESIS', objects: {
  mission: 'find causes', candidateHypotheses: ['h1'], experiment: { worlds: 3 }
} });
assert.deepEqual(domain.operations.map((operation) => operation.kind),
  ['READ', 'SELECT', 'CALL', 'INFER', 'CHECK']);
const compiled = compiler.compilePrompt({ prompt: 'native trinity residual', domain: domain.domain,
  program: domain.operations });
assert.equal(compiled.status, 'ready');
assert.equal(compiled.mode, 'native_domain_graph');
assert.equal(compiled.plan.status, 'deferred');
assert.deepEqual(compiled.plan.residual, ['read_trinity', 'select_trinity', 'call_trinity',
  'infer_trinity', 'check_trinity']);
console.log('G-CIR Omega domain graph checks passed.');
