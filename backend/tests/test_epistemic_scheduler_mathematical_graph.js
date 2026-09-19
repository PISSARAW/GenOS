'use strict';

const assert = require('node:assert/strict');
const {
  MathematicalDependencyGraph, CounterexamplePropagator,
} = require('../src/services/epistemicScheduler');

const graph = new MathematicalDependencyGraph();
graph.addNode({ nodeId: 'l1', type: 'lemma', canonicalStatement: 'Lemme initial.', status: 'verified', domainFingerprint: 'domain:d' });
graph.addNode({ nodeId: 'l2', type: 'lemma', canonicalStatement: 'Lemme intermédiaire.', status: 'conjecture', domainFingerprint: 'domain:d' });
graph.addNode({ nodeId: 't1', type: 'theorem', canonicalStatement: 'Théorème final.', status: 'blocked', domainFingerprint: 'domain:d' });
graph.addNode({ nodeId: 'c1', type: 'counterexample', canonicalStatement: 'Contre-exemple de L1.', status: 'verified', domainFingerprint: 'domain:d' });
graph.addEdge({ from: 'l1', to: 'l2', type: 'uses' });
graph.addEdge({ from: 'l2', to: 't1', type: 'implies' });
graph.addEdge({ from: 'c1', to: 'l1', type: 'contradicts', witnessResultId: 'result:c1' });

assert.deepEqual(graph.openFrontier(), ['l2']);
graph.updateStatus('l2', 'formalized');
assert.deepEqual(graph.openFrontier(), ['t1']);
assert.deepEqual(graph.descendants('l1'), ['l2', 't1']);
assert.throws(() => graph.addEdge({ from: 't1', to: 'l1', type: 'uses' }), /acyclic/);

const exported = graph.exportGraph();
assert.equal(exported.contractVersion, 'genos.mathematical-dependency-graph/v1');
assert.deepEqual(exported.roots, ['c1', 'l1']);
assert.deepEqual(exported.leaves, ['c1', 't1']);
assert.equal(exported.nodes.length, 4);
assert.equal(exported.edges.length, 3);

const propagated = new CounterexamplePropagator({ graph });
propagated.propagate({ targetId: 'l1', counterexampleResultId: 'result:c1', domainFingerprint: 'domain:d' });
assert.equal(graph.getNode('t1').status, 'invalidated');

console.log('Epistemic scheduler mathematical dependency graph passed.');
