'use strict';

const assert = require('node:assert/strict');
const {
  MathematicalDependencyGraph, LeanIncrementalGate,
} = require('../src/services/epistemicScheduler');

const environmentDigest = `sha256:${'e'.repeat(64)}`;
const graph = new MathematicalDependencyGraph();
graph.addNode({ nodeId: 'l1', type: 'lemma', canonicalStatement: 'L1.', status: 'formalized' });
graph.addNode({ nodeId: 'l2', type: 'lemma', canonicalStatement: 'L2.', status: 'formalized' });
graph.addNode({ nodeId: 't1', type: 'theorem', canonicalStatement: 'T1.', status: 'formalized' });
graph.addEdge({ from: 'l1', to: 'l2', type: 'uses' });
graph.addEdge({ from: 'l2', to: 't1', type: 'uses' });

let executions = 0;
const executor = async (request) => {
  executions += 1;
  const axioms = request.source.includes('Classical.choice') ? ['Classical.choice'] : [];
  return { exitCode: 0, toolchainVersion: 'v4.19.0', axioms };
};
const receipts = [];
const gate = new LeanIncrementalGate({
  graph, executor, toolchainVersion: 'v4.19.0', environmentDigest,
  allowedAxioms: [], publish: (receipt) => receipts.push(receipt),
  clock: () => '2026-09-19T14:00:00.000Z',
});

assert.deepEqual(gate.pendingVerifications(), ['l1']);

(async () => {
  const first = await gate.verifyNode({ nodeId: 'l1', source: 'theorem l1 : True := by trivial' });
  assert.equal(first.status, 'passed');
  assert.equal(graph.getNode('l1').status, 'verified');
  assert.deepEqual(gate.pendingVerifications(), ['l2']);

  const forbidden = await gate.verifyNode({ nodeId: 'l2', source: 'theorem l2 : True := Classical.choice inferInstance' });
  assert.equal(forbidden.status, 'failed');
  assert.equal(forbidden.reason, 'forbidden_axioms');
  assert.equal(graph.getNode('l2').status, 'blocked');
  assert.deepEqual(gate.pendingVerifications(), []);

  graph.updateStatus('l2', 'formalized');
  const passed = await gate.verifyNode({ nodeId: 'l2', source: 'theorem l2 : True := by trivial' });
  assert.equal(passed.status, 'passed');
  assert.equal(passed.dependencyReceiptDigests.length, 1);
  assert.deepEqual(gate.pendingVerifications(), ['t1']);

  const beforePlaceholder = executions;
  const placeholder = await gate.verifyNode({ nodeId: 't1', source: 'theorem t1 : True := by sorry' });
  assert.equal(placeholder.status, 'failed');
  assert.match(placeholder.reason, /forbidden/);
  assert.equal(executions, beforePlaceholder);
  assert.equal(receipts.length, 4);
  assert.match(gate.verificationReceipt('l1').receiptDigest, /^sha256:[a-f0-9]{64}$/);

  console.log('Epistemic scheduler incremental Lean gate passed.');
})().catch((error) => { console.error(error); process.exit(1); });
