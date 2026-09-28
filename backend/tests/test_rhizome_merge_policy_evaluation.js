'use strict';

const assert = require('node:assert/strict');
const { evaluateMerge } = require('../src/services/rhizome/bridges/mergePolicyEvaluationService');

const input = {
  graphRevision: 'graph-12', expectedGraphRevision: 'graph-12', latencySamplesMs: [10, 12, 11],
  metrics: { bridgeFitness: 0.9, coverage: 0.96, provenanceScore: 1, transferReliability: 0.98, stability: 0.5 },
  policy: { version: 'v1', minFitness: 0.8, minCoverage: 0.95, minProvenance: 0.9, maxLatencyVariance: 2, minTransferReliability: 0.95, minLeaseMs: 1000, maxLeaseMs: 5000 },
  evidenceRefs: ['bridge-proof:1'],
};

const result = evaluateMerge(input);
assert.equal(result.decision.canMerge, true);
assert.equal(result.decision.transferAllowed, true);
assert.equal(result.decision.leaseMs, 3000);
assert.match(result.receiptHash, /^[a-f0-9]{64}$/);
assert.throws(() => evaluateMerge({ ...input, graphRevision: 'graph-13' }), { code: 'RHIZOME_GRAPH_STALE' });
assert.equal(evaluateMerge({ ...input, metrics: { ...input.metrics, coverage: 0.94 } }).decision.canMerge, false);
assert.throws(() => evaluateMerge({ ...input, latencySamplesMs: [] }), { code: 'RHIZOME_DATA_MISSING' });
assert.throws(() => evaluateMerge({ ...input, metrics: undefined }), { code: 'RHIZOME_DATA_MISSING' });
assert.throws(() => evaluateMerge({ ...input, metrics: { ...input.metrics, coverage: '0.96' } }), { code: 'RHIZOME_DATA_MISSING' });
console.log('Rhizome merge policy evaluation: explicit metrics, stale graph and bounded decisions passed.');
