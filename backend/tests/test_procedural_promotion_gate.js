'use strict';

const assert = require('assert');
const gate = require('../src/services/proceduralPromotionGateService');
const select = require('../src/services/proceduralActionSelectionService');

// Test promotion gate
const baseOrganism = {
  metadata: { id: 'po-abc120', version: 5 },
  structure: { nodes: [{ id: 'a' }, { id: 'b' }] },
  fitness: { components: { evidence: 0.9, robustness: 0.7 } },
};

const goodCandidate = {
  metadata: { id: 'po-abc121', parentId: 'po-abc120', version: 6 },
  structure: { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
  fitness: { components: { evidence: 0.95, robustness: 0.8 } },
};

const promoted = gate.evaluatePromotionGate({
  organism: baseOrganism,
  candidate: goodCandidate,
  policy: { minEvidence: 0.5, minRobustness: 0.3, maxNodes: 100 },
});
assert.strictEqual(promoted.promoted, true);
assert.strictEqual(promoted.blocking.length, 0);

const badEvidence = {
  metadata: { id: 'po-abc122', parentId: 'po-abc120', version: 6 },
  structure: { nodes: [{ id: 'a' }, { id: 'b' }] },
  fitness: { components: { evidence: 0.1, robustness: 0.8 } },
};

const rejected = gate.evaluatePromotionGate({
  organism: baseOrganism,
  candidate: badEvidence,
  policy: { minEvidence: 0.5, minRobustness: 0.3 },
});
assert.strictEqual(rejected.promoted, false);
assert.ok(rejected.blocking.find((g) => g.name === 'evidence'));

const tooComplex = {
  metadata: { id: 'po-abc123', parentId: 'po-abc120', version: 6 },
  structure: { nodes: Array(150).fill(null).map((_, i) => ({ id: `n${i}` })) },
  fitness: { components: { evidence: 0.9, robustness: 0.8 } },
};

const complexityRejected = gate.evaluatePromotionGate({
  organism: baseOrganism,
  candidate: tooComplex,
  policy: { maxNodes: 100 },
});
assert.strictEqual(complexityRejected.promoted, false);
assert.ok(complexityRejected.blocking.find((g) => g.name === 'complexity'));

const immuneRejected = {
  metadata: { id: 'po-abc124', parentId: 'po-abc120', version: 6 },
  structure: { nodes: [{ id: 'a' }] },
  fitness: { components: { evidence: 0.9, robustness: 0.8 } },
  immune: { rejected: true, findings: [{ pattern: 'REMOVE_REQUIRED_GATE' }] },
};

const immuneResult = gate.evaluatePromotionGate({
  organism: baseOrganism,
  candidate: immuneRejected,
});
assert.strictEqual(immuneResult.promoted, false);
assert.ok(immuneResult.blocking.find((g) => g.name === 'immune'));

// Test softmax
const scores = [0.8, 0.5, 0.3];
const probs = select.softmax(scores, 0.5);
assert.ok(Math.abs(probs.reduce((a, b) => a + b, 0) - 1) < 1e-9);
assert.ok(probs[0] > probs[1]);
assert.ok(probs[1] > probs[2]);

const highTemp = select.softmax(scores, 10);
assert.ok(highTemp[0] - highTemp[2] < 0.3);

const lowTemp = select.softmax(scores, 0.01);
assert.ok(lowTemp[0] > 0.9);

// Test action selection with softmax
const c1 = select.candidateAction({ id: 'a', weight: 0.9 });
const c2 = select.candidateAction({ id: 'b', weight: 0.3 });
const result = select.selectActions([c1, c2], {}, { topN: 2, winnerTakeMost: true, temperature: 0.5 });
assert.ok(result.distribution);
assert.ok(Math.abs(result.distribution.reduce((a, d) => a + d.probability, 0) - 1) < 1e-9);
assert.ok(result.distribution[0].probability > result.distribution[1].probability);

console.log('=== procedural promotion gate + softmax: all passed ===');
