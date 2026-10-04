'use strict';

const assert = require('node:assert/strict');
const registry = require('../src/services/cognitiveObligationRegistry');

function nodes() {
  return [
    { id: 'source', kind: 'INPUT', state: 'satisfied', dependsOn: [],
      basis: { kind: 'materialized_prompt', reference: 'sha256:source' } },
    { id: 'gate', kind: 'GATE', state: 'enforced', dependsOn: ['source'],
      basis: { kind: 'runtime_flag', reference: 'authorized' } },
    { id: 'infer', kind: 'INFER', state: 'open', dependsOn: ['gate'] },
    { id: 'check', kind: 'CHECK', state: 'open', dependsOn: ['infer'] }
  ];
}

function plan(obligations, version = registry.VERSION) {
  return registry.plan({ version, operation: 'INFER', obligations });
}

function testRunnableResidual() {
  const result = plan(nodes());
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.residual, ['infer', 'check']);
  assert.deepEqual(result.runnable, ['infer']);
  assert.deepEqual(result.waiting, ['check']);
  assert.equal(result.obligations.find((item) => item.id === 'check').state, 'open');
  assert.match(result.digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(plan(nodes().reverse()).digest, result.digest);
  const reordered = nodes();
  reordered[0] = { basis: { reference: 'sha256:source', kind: 'materialized_prompt' },
    dependsOn: [], state: 'satisfied', kind: 'INPUT', id: 'source' };
  assert.equal(plan(reordered).digest, result.digest);
}

function testResolvedAndDeferred() {
  const resolved = nodes().slice(0, 2);
  assert.equal(plan(resolved).status, 'resolved');
  const deferred = [...resolved, { id: 'read', kind: 'INPUT', state: 'open', dependsOn: ['gate'] },
    { id: 'infer', kind: 'INFER', state: 'open', dependsOn: ['read'] }];
  const result = plan(deferred);
  assert.equal(result.status, 'deferred');
  assert.deepEqual(result.runnable, ['read']);
  assert.deepEqual(result.waiting, ['infer']);
}

function testInvalidGraphs() {
  assert.equal(plan(nodes(), 99).reason, 'obligation_version_unsupported');
  assert.equal(plan([...nodes(), nodes()[0]]).reason, 'obligation_id_duplicate');
  assert.equal(plan([{ id: 'infer', kind: 'INFER', state: 'open', dependsOn: ['missing'] }])
    .reason, 'dependency_missing');
  assert.equal(plan([{ id: 'left', kind: 'INPUT', state: 'open', dependsOn: ['right'] },
    { id: 'right', kind: 'INPUT', state: 'open', dependsOn: ['left'] }]).reason, 'dependency_cycle');
  assert.equal(plan([{ id: 'source', kind: 'INPUT', state: 'open', dependsOn: [] },
    { id: 'gate', kind: 'GATE', state: 'enforced', dependsOn: ['source'],
      basis: { kind: 'runtime_flag', reference: 'authorized' } }])
    .reason, 'obligation_dependency_unsettled');
  assert.equal(plan([{ id: 'source', kind: 'INPUT', state: 'satisfied', dependsOn: [] }])
    .reason, 'obligation_basis_missing');
  assert.equal(plan([{ id: 'source', kind: 'INPUT', state: 'open', dependsOn: [], secret: 'lost' }])
    .reason, 'obligation_field_unknown');
  assert.equal(plan([{ id: 'proof', kind: 'CHECK', state: 'satisfied', dependsOn: [],
    basis: { kind: 'runtime_flag', reference: 'model_says_valid' } }]).reason, 'check_receipt_required');
  const blocked = nodes();
  blocked[0] = { id: 'source', kind: 'INPUT', state: 'blocked', dependsOn: [], reason: 'source_expired' };
  assert.equal(plan(blocked).reason, 'obligation_blocked');
  assert.equal(plan(Array.from({ length: 65 }, (_, index) => ({
    id: `node_${index}`, kind: 'INPUT', state: 'open', dependsOn: []
  }))).reason, 'obligation_count_invalid');
}

testRunnableResidual();
testResolvedAndDeferred();
testInvalidGraphs();
console.log('Cognitive obligation registry checks passed.');
