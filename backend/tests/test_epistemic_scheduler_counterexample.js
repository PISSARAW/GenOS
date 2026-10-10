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
const receiptDigest = `sha256:${'a'.repeat(64)}`;
const evidence = new Map([['result:counterexample-1', {
  status: 'validated', targetId: 'lemma-a',
  counterexampleResultId: 'result:counterexample-1',
  domainFingerprint: 'domain:integers', receiptDigest,
}]]);
assert.throws(() => new CounterexamplePropagator({ graph }), /verifier is required/);
const propagator = new CounterexamplePropagator({
  graph, publish: (event) => published.push(event), clock: () => '2026-09-19T13:00:00.000Z',
  verifyCounterexample: async ({ counterexampleResultId }) => evidence.get(counterexampleResultId) || null,
});

(async () => {
  const request = { targetId: 'lemma-a', counterexampleResultId: 'result:counterexample-1', domainFingerprint: 'domain:integers' };
  await assert.rejects(propagator.propagate({ ...request, counterexampleResultId: 'invented' }), /verification rejected/);
  await assert.rejects(propagator.propagate({ ...request, domainFingerprint: 'domain:other' }), /domain does not match/);
  evidence.set('result:counterexample-1', { ...evidence.get('result:counterexample-1'), targetId: 'lemma-b' });
  await assert.rejects(propagator.propagate(request), /verification rejected/);
  evidence.set('result:counterexample-1', { ...evidence.get('result:counterexample-1'), targetId: 'lemma-a', domainFingerprint: 'domain:other' });
  await assert.rejects(propagator.propagate(request), /verification rejected/);
  evidence.set('result:counterexample-1', { ...evidence.get('result:counterexample-1'), domainFingerprint: 'domain:integers', receiptDigest: 'sha256:fake' });
  await assert.rejects(propagator.propagate(request), /verification rejected/);
  assert.equal(graph.getNode('lemma-a').status, 'verified');
  assert.equal(graph.getNode('lemma-b').status, 'running');
  assert.equal(published.length, 0);

  evidence.set('result:counterexample-1', { ...evidence.get('result:counterexample-1'), receiptDigest });
  const stale = new CounterexamplePropagator({
    graph, verifyCounterexample: async () => {
      graph.updateStatus('lemma-a', 'queued');
      return evidence.get('result:counterexample-1');
    },
  });
  await assert.rejects(stale.propagate(request), /changed during verification/);
  graph.updateStatus('lemma-a', 'verified');
  assert.equal(published.length, 0);
  const result = await propagator.propagate(request);
  assert.equal(graph.getNode('lemma-a').status, 'refuted');
  assert.equal(graph.getNode('lemma-b').status, 'invalidated');
  assert.equal(graph.getNode('theorem-c').status, 'invalidated');
  assert.equal(graph.getNode('lemma-disjoint').status, 'running');
  assert.equal(graph.getNode('lemma-unknown').status, 'suspended');
  assert.equal(result.events.length, 4);
  assert.equal(result.receiptDigest, receiptDigest);
  assert.deepEqual(result.events, published);
  assert.ok(published.every((event) => event.occurredAt === '2026-09-19T13:00:00.000Z'));
  await assert.rejects(propagator.propagate({ targetId: 'lemma-a' }), /required/);

  console.log('Epistemic scheduler counterexample propagation passed.');
})().catch((error) => { console.error(error); process.exit(1); });
