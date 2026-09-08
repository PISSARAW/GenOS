const assert = require('node:assert/strict');
const service = require('../src/services/evaluationObservabilityService');

const first = service.__testHash({ a: 1, b: 2 });
const second = service.__testHash({ b: 2, a: 1 });
assert.equal(first, second);
console.log('Evaluation provenance canonical hash checks passed.');