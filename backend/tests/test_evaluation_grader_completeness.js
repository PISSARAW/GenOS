const assert = require('node:assert/strict');
const { summarizeEvaluationGraders } = require('../src/services/jobWorker');

const summary = summarizeEvaluationGraders([
  { graders: { exact_match: { passed: true } } }
], ['exact_match', 'groundedness'], 2);
assert.equal(summary.exact_match.complete, false);
assert.equal(summary.exact_match.missing, 1);
assert.equal(summary.exact_match.score, 0.5);
assert.equal(summary.groundedness.complete, false);
assert.equal(summary.groundedness.missing, 2);
console.log('Evaluation grader summaries expose incomplete coverage.');