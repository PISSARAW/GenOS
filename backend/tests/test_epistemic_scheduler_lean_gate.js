'use strict';

const assert = require('node:assert/strict');
const {
  MathematicalDependencyGraph, LeanIncrementalGate,
} = require('../src/services/epistemicScheduler');
const { VerificationRegistry } = require('../src/services/mathematical/verificationRegistry');
const { createFormalizationArtifact, createFormalizationRegistry } = require('../src/services/mathematical/formalizationArtifact');

const environmentDigest = `sha256:${'e'.repeat(64)}`;
const graph = new MathematicalDependencyGraph();
graph.addNode({ nodeId: 'l1', type: 'lemma', canonicalStatement: '0 = 0', status: 'formalized' });
graph.addNode({ nodeId: 'l2', type: 'lemma', canonicalStatement: '1 + 1 = 2', status: 'formalized' });
graph.addNode({ nodeId: 't1', type: 'theorem', canonicalStatement: '2 + 2 = 4', status: 'formalized' });
graph.addEdge({ from: 'l1', to: 'l2', type: 'uses' });
graph.addEdge({ from: 'l2', to: 't1', type: 'uses' });

let executions = 0;
const executor = async (request) => {
  executions += 1;
  const axioms = request.source.includes('Classical.choice') ? ['Classical.choice'] : [];
  return { exitCode: 0, toolchainVersion: 'v4.19.0', axioms };
};
const receipts = [];
const registry = new VerificationRegistry();
const gate = new LeanIncrementalGate({
  graph, executor, toolchainVersion: 'v4.19.0', environmentDigest,
  registry,
  allowedAxioms: [], publish: (receipt) => receipts.push(receipt),
  clock: () => '2026-09-19T14:00:00.000Z',
});

assert.deepEqual(gate.pendingVerifications(), ['l1']);

(async () => {
  const mismatch = await gate.verifyNode({ nodeId: 'l1', source: 'theorem l1 : True := by trivial' });
  assert.equal(mismatch.status, 'failed');
  assert.match(mismatch.reason, /statement mismatch/);
  assert.equal(executions, 0);
  assert.equal(registry.size(), 0);
  graph.updateStatus('l1', 'formalized');

  const first = await gate.verifyNode({ nodeId: 'l1', source: 'theorem l1 : 0 = 0 := by rfl' });
  assert.equal(first.status, 'passed');
  assert.equal(registry.size(), 1);
  assert.match(first.canonicalStatementDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(graph.getNode('l1').status, 'verified');
  assert.deepEqual(gate.pendingVerifications(), ['l2']);

  const forbidden = await gate.verifyNode({ nodeId: 'l2', source: 'theorem l2 : 1 + 1 = 2 := Classical.choice inferInstance' });
  assert.equal(forbidden.status, 'failed');
  assert.equal(forbidden.reason, 'forbidden_axioms');
  assert.equal(graph.getNode('l2').status, 'blocked');
  assert.deepEqual(gate.pendingVerifications(), []);

  graph.updateStatus('l2', 'formalized');
  const passed = await gate.verifyNode({ nodeId: 'l2', source: 'theorem l2 : 1 + 1 = 2 := by decide' });
  assert.equal(passed.status, 'passed');
  assert.equal(passed.dependencyReceiptDigests.length, 1);
  assert.deepEqual(gate.pendingVerifications(), ['t1']);

  const beforePlaceholder = executions;
  const placeholder = await gate.verifyNode({ nodeId: 't1', source: 'theorem t1 : 2 + 2 = 4 := by sorry' });
  assert.equal(placeholder.status, 'failed');
  assert.match(placeholder.reason, /forbidden/);
  assert.equal(executions, beforePlaceholder);
  assert.equal(receipts.length, 5);
  assert.match(gate.verificationReceipt('l1').receiptDigest, /^sha256:[a-f0-9]{64}$/);

  graph.updateStatus('t1', 'formalized');
  const formalization = createFormalizationArtifact({
    naturalStatement: '2 + 2 = 4', formalStatement: '2 + 2 = 4',
  });
  const badBinding = await gate.verifyNode({
    nodeId: 't1', source: 'theorem t1 : True := by trivial', formalization,
  });
  assert.equal(badBinding.status, 'failed');
  assert.equal(registry.size(), 2);
  graph.updateStatus('t1', 'formalized');
  const arbitraryBinding = await gate.verifyNode({
    nodeId: 't1', source: 'theorem t1 : True := by trivial',
    formalization: { naturalStatement: '2 + 2 = 4', formalStatement: 'True' },
  });
  assert.equal(arbitraryBinding.status, 'failed');
  assert.equal(registry.size(), 2);

  graph.addNode({ nodeId: 'natural', type: 'theorem', canonicalStatement: 'Deux plus deux font quatre.', status: 'formalized' });
  const registered = createFormalizationArtifact({
    naturalStatement: 'Deux plus deux font quatre.', formalStatement: '2 + 2 = 4',
  });
  const formalizationRegistry = createFormalizationRegistry();
  const unregistered = await gate.verifyNode({
    nodeId: 'natural', source: 'theorem natural : 2 + 2 = 4 := by decide',
    formalization: registered,
  });
  assert.equal(unregistered.status, 'failed');
  assert.match(unregistered.reason, /not registered/);
  assert.equal(registry.size(), 2);
  graph.updateStatus('natural', 'formalized');
  formalizationRegistry.add(registered);
  gate.setFormalizationRegistry(formalizationRegistry);
  const bound = await gate.verifyNode({
    nodeId: 'natural', source: 'theorem natural : 2 + 2 = 4 := by decide',
    formalization: registered,
  });
  assert.equal(bound.status, 'passed');
  assert.equal(registry.size(), 3);

  console.log('Epistemic scheduler incremental Lean gate passed.');
})().catch((error) => { console.error(error); process.exit(1); });
