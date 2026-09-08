const assert = require('node:assert/strict');
const { calculateMetricScore } = require('../src/services/evaluationObservabilityService');

const brier = calculateMetricScore('brier', [0.2]);
assert.equal(brier.value, 0.2);
assert.equal(brier.quality, 0.8);
assert.equal(brier.evaluation, 'NOMINAL');
assert.equal(brier.direction, 'lower_is_better');

const custom = calculateMetricScore('latency_ms', [100]);
assert.equal(custom.evaluation, 'UNINTERPRETED');
assert.equal(custom.qualityGuarantee, false);
assert.equal(custom.sampleSize, 1);

assert.throws(() => calculateMetricScore('success_rate', [1.2]), /normalized values/);
console.log('Metric semantics checks passed.');