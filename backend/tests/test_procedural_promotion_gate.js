'use strict';

const assert = require('assert');
const gate = require('../src/services/proceduralPromotionGateService');

// Test promotion gate
const baseOrganism = {
  metadata: { id: 'po-abc120', version: 5 },
  structure: { nodes: [{ id: 'a' }, { id: 'b' }] },
  fitness: {
    score: 0.85,
    components: { evidence: 0.9, robustness: 0.7, success: 0.95, risk: 0.05, generalization: 0.68 },
  },
};

const goodCandidate = {
  metadata: { id: 'po-abc121', parentId: 'po-abc120', version: 6 },
  structure: { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
  fitness: {
    score: 0.90,
    components: { evidence: 0.95, robustness: 0.8, success: 0.96, risk: 0.03, generalization: 0.70 },
  },
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
  fitness: { score: 0.4, components: { evidence: 0.1, robustness: 0.8, success: 0.4 } },
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
  fitness: { score: 0.9, components: { evidence: 0.9, robustness: 0.8, success: 0.9 } },
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
  fitness: { score: 0.9, components: { evidence: 0.9, robustness: 0.8, success: 0.9 } },
  immune: { rejected: true, findings: [{ pattern: 'REMOVE_REQUIRED_GATE' }] },
};

const immuneResult = gate.evaluatePromotionGate({
  organism: baseOrganism,
  candidate: immuneRejected,
});
assert.strictEqual(immuneResult.promoted, false);
assert.ok(immuneResult.blocking.find((g) => g.name === 'immune'));

const regressedCandidate = {
  metadata: { id: 'po-abc125', parentId: 'po-abc120', version: 6 },
  structure: { nodes: [{ id: 'a' }, { id: 'b' }] },
  fitness: {
    score: 0.70,
    components: { evidence: 0.9, robustness: 0.8, success: 0.40, risk: 0.30, generalization: 0.30 },
  },
};

const regressed = gate.evaluatePromotionGate({
  organism: baseOrganism,
  candidate: regressedCandidate,
  policy: { maxSuccessRegression: 0.1, maxRiskIncrease: 0.1, minGeneralization: 0.5 },
});
assert.strictEqual(regressed.promoted, false);
assert.ok(regressed.blocking.find((g) => g.name === 'success_regression'));
assert.ok(regressed.blocking.find((g) => g.name === 'risk_regression'));
assert.ok(regressed.blocking.find((g) => g.name === 'generalization'));

console.log('=== procedural promotion gate + non-regression: all passed ===');
