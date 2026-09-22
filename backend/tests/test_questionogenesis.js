'use strict';

const assert = require('node:assert');
const { QuestionogenesisEngine } = require('../src/services/mathematical/questionogenesisService');

const engine = new QuestionogenesisEngine();

// Observe anomaly
const anomaly = engine.observeAnomaly({
  type: 'unexpected_invariant',
  description: 'coloring number = chromatic number',
  confidence: 0.7,
});
assert.ok(anomaly.id);

// Generate question from anomaly - provide high-value context to keep it open
const question = engine.generateQuestion(anomaly, { domain: 'combinatorics', novelty: 0.9, testability: 0.9, expectedInfoGain: 0.9, futureAffordances: 0.9 });
assert.ok(question.id);
assert.strictEqual(question.state, 'open');
assert.ok(question.value.total > 0.15, 'High-value question should exceed threshold');

// Generate from recurring motif with high value context
const motifs = ['symmetric_structure', 'recursive_pattern', 'dual_representation'];
const deepQuestion = engine.fromRecurringMotif(motifs, { condition: 'n > 99', novelty: 0.9, testability: 0.9, expectedInfoGain: 0.9, futureAffordances: 0.9 });
assert.ok(deepQuestion);
assert.ok(deepQuestion.id);
assert.strictEqual(deepQuestion.state, 'open', 'High-value recurring motif question should be open');

// Summary: both methods now store in questions Map
const s = engine.summary();
assert.ok(s.questions >= 2, 'Expected >= 2 questions, got ' + s.questions);
assert.ok(s.anomalies === 1);

console.log('OK Math-4 QuestionogenesisEngine');
