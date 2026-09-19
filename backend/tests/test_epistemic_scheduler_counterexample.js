'use strict';

const assert = require('node:assert/strict');
const { DependencyIndex, CounterexamplePropagator } = require('../src/services/epistemicScheduler');

const graph = new DependencyIndex();
graph.addNode({ nodeId: 'lemma-a', dependencies: [], domainFingerprint: 'domain:integers', status: 'verified' });
graph.addNode({ nodeId: 'lemma-b', dependencies: ['lemma-a'], domainFingerprint: 'domain:integers', status: 'running' });
graph.addNode({ nodeId: 'theorem-c', dependencies: ['lemma-b'], domainFingerprint: 'domain:integers', status: 'queued' });
graph.addNode({
  nodeId: 'lemma-disjoint', dependencies: ['lemma-a'], domainFingerprint: 'domain:reals-positive',
  disjointDomainFingerprints: ['domain:integers'], status: 'running',
});
graph.addNode({ nodeId: 'lemma-unknown', dependencies: ['lemma-a'], domainFingerprint: 'domain:unknown', status: 'running' });

const published = [];
const propagator = new CounterexamplePropagator({
  graph, publish: (event) => published.push(event), clock: () => '2026-09-19T13:00:00.000Z',
});
const result = propagator.propagate({
  targetId: 'lemma-a', counterexampleResultId: 'result:counterexample-1', domainFingerprint: 'domain:integers',
});

assert.equal(graph.getNode('lemma-a').status, 'refuted');
assert.equal(graph.getNode('lemma-b').status, 'invalidated');
assert.equal(graph.getNode('theorem-c').status, 'invalidated');
assert.equal(graph.getNode('lemma-disjoint').status, 'running');
assert.equal(graph.getNode('lemma-unknown').status, 'suspended');
assert.equal(result.events.length, 4);
assert.deepEqual(result.events, published);
assert.ok(published.every((event) => event.occurredAt === '2026-09-19T13:00:00.000Z'));
assert.throws(() => propagator.propagate({ targetId: 'lemma-a' }), /required/);

console.log('Epistemic scheduler counterexample propagation passed.');
