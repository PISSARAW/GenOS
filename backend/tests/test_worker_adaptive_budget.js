'use strict';

const assert = require('node:assert/strict');
const workerKinds = require('../src/services/agents/workerKindService');

const fundedContract = workerKinds.buildWorkerContract('adaptive_worker', {
  workerTokenLimit: 12000
});
assert.equal(fundedContract.resources.maxTokens, 12000,
  'adaptive workers should be able to use a funded allocation above the generic 8000-token fallback');

const fallbackContract = workerKinds.buildWorkerContract('adaptive_worker');
assert.equal(fallbackContract.resources.maxTokens, 8000,
  'adaptive workers without an explicit funded allocation should retain the conservative fallback');

console.log('Adaptive worker funded token limit checks passed.');
