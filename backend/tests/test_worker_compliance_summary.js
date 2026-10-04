'use strict';

const assert = require('node:assert/strict');
const { expectedUnavailable, summarizeCompliance } = require('./workerComplianceSummary.cjs');

const kinds = ['bounded_worker', 'procedural_executor', 'formal_worker'];
const results = [
  { kind: 'bounded_worker', passed: true },
  { kind: 'procedural_executor', passed: true },
  { kind: 'formal_worker', passed: false, errorCode: 'WORKER_EXECUTOR_UNAVAILABLE' }
];
assert.equal(expectedUnavailable('bounded_worker', 'WORKER_EXECUTOR_UNAVAILABLE'), false);
assert.deepEqual(summarizeCompliance(results, kinds), {
  executed: 2, unavailable: 1, failed: 0, accepted: true
});
assert.equal(summarizeCompliance([
  results[0], results[1], { ...results[2], errorCode: 'INVALID_WORKER_ARTIFACT' }
], kinds).accepted, false);
assert.equal(summarizeCompliance([results[0], results[0], results[2]], kinds).accepted, false);

console.log('Worker compliance reporting distinguishes executed and unavailable kinds: PASS');
