'use strict';

const assert = require('node:assert/strict');
const registry = require('../src/services/cognitiveObligationRegistry');
const slicer = require('../src/services/cognitiveDependencySlicerService');
const { createLedger } = require('../src/services/cognitiveVisibilityLedger');
const { createWorkingSet } = require('../src/services/cognitiveWorkingSetService');
const abi = require('../src/services/modelCognitiveAbiService');
const omega = require('../src/services/cognitiveOmegaCompiler');

const nodes = [
  { id: 'read_repo', kind: 'READ', state: 'satisfied', dependsOn: [],
    basis: { kind: 'runtime_flag', reference: 'repo_read' } },
  { id: 'select_auth', kind: 'SELECT', state: 'satisfied', dependsOn: ['read_repo'],
    basis: { kind: 'runtime_flag', reference: 'auth_slice' } },
  { id: 'infer', kind: 'INFER', state: 'open', dependsOn: ['select_auth'] },
  { id: 'check', kind: 'CHECK', state: 'open', dependsOn: ['infer'] }
];

const plan = registry.plan({ version: registry.VERSION, operation: 'OMEGA', obligations: nodes });
assert.equal(plan.status, 'ready');
assert.deepEqual(plan.runnable, ['infer']);
assert.equal(slicer.slice({ nodes, targets: ['check'] }).nodes.length, 4);
assert.deepEqual(slicer.slice({ nodes, targets: ['infer'] }).omitted, ['check']);

const ledger = createLedger();
const materialized = ledger.materialize({ sessionId: 's1', objectId: 'f1', value: { claim: 'x' } });
assert.equal(ledger.visible({ sessionId: 's1', objectId: materialized.objectId }).visible, true);
ledger.invalidate({ sessionId: 's1', objectIds: ['f1'] });
assert.equal(ledger.visible({ sessionId: 's1', objectId: 'f1' }).visible, false);

const workingSet = createWorkingSet({ capacity: 1 });
workingSet.pageIn({ id: 'f1', value: 'one' });
assert.equal(workingSet.need('f2').status, 'page_fault');
workingSet.pageIn({ id: 'f2', value: 'two' });
assert.equal(workingSet.need('f1').status, 'page_fault');

const profiles = abi.createRegistry({ qwen: { model: 'qwen', representations: ['sexpr', 'portable'] } });
const result = omega.compile({ operations: nodes, targets: ['infer'], model: 'qwen', abi: profiles,
  constraints: { noWrite: true } });
assert.equal(result.status, 'ready');
assert.equal(result.projection.representation, 'sexpr');
assert.match(result.digest, /^sha256:[a-f0-9]{64}$/);
assert.equal(result.slice.nodes.length, 3);
console.log('G-CIR Omega checks passed.');
