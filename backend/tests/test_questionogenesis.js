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

// Generate question from anomaly
const question = engine.generateQuestion(anomaly, { domain: 'combinatorics' });
assert.ok(question.id);
assert.strictEqual(question.state, 'open');

// Generate from recurring motif
const motifs = ['symmetric_structure', 'recursive_pattern', 'dual_representation'];
const deepQuestion = engine.fromRecurringMotif(motifs, { condition: 'n > 99' });
assert.ok(deepQuestion);
assert.ok(deepQuestion.id);

// Summary: both methods now store in questions Map
const s = engine.summary();
assert.ok(s.questions >= 2, 'Expected >= 2 questions, got ' + s.questions);
assert.ok(s.anomalies === 1);

console.log('OK Math-4 QuestionogenesisEngine');
