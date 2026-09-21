'use strict';

const assert = require('node:assert');
const E = require('../src/services/epistemic/epistemicEcologicalSelectionService');

// ---- brier score ----

assert.ok(Math.abs(E.brierScore(0.8, true) - 0.04) < 1e-10);
assert.ok(Math.abs(E.brierScore(0.8, false) - 0.64) < 1e-10);
assert.ok(Math.abs(E.brierScore(0.5, true) - 0.25) < 1e-10);

// ---- weighted consensus ----

const votes = [
  { probability: 0.8, weight: 1 },
  { probability: 0.6, weight: 2 },
  { probability: 0.9, weight: 1 },
];
const consensus = E.weightedConsensus(votes, 0.5);
assert.ok(consensus.consensus > 0.6);
assert.strictEqual(consensus.totalWeight, 4);
assert.strictEqual(consensus.voteCount, 3);
assert.ok(consensus.confidence > 0);

// ---- consensus quality ----

const quality = E.consensusQuality(votes, 0.5);
assert.ok(quality.meanProbability > 0);
assert.ok(quality.variance >= 0);
assert.ok(quality.consensus > 0);
assert.ok(typeof quality.confidence === 'number');
assert.strictEqual(typeof quality.isReliable, 'boolean');

// ---- ecological selection ----

const populations = [
  { id: 'A', reviewers: [{ type: 'test' }, { type: 'replay' }], effectiveDiversity: 0.7 },
  { id: 'B', reviewers: [{ type: 'test' }], effectiveDiversity: 0.2 },
  { id: 'C', reviewers: [{ type: 'source' }, { type: 'proof' }], effectiveDiversity: 0.6 },
];
const selected = E.ecologicalSelection(populations, { diversityThreshold: 0.3 });
assert.strictEqual(selected.selected, 2);
assert.strictEqual(selected.total, 3);
assert.ok(selected.selectedIds.includes('A'));
assert.ok(selected.selectedIds.includes('C'));

// ---- consensus observer ----

const outcomes = [true, false, true];
const observer = E.consensusObserver(populations, outcomes);
assert.strictEqual(observer.observerCount, 3);
assert.strictEqual(observer.results.length, 3);
assert.ok(typeof observer.reliableCount === 'number');

console.log('OK epistemicEcologicalSelectionService');
