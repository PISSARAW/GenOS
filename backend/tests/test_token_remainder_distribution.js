const assert = require('node:assert/strict');
const { buildAllocation } = require('../src/services/tokenAllocationService');

const allocation = buildAllocation({ totalTokens: 1001, workerShare: 0.6, workerCount: 3, minimumWorkerTokens: 1, mode: 'successive_halving_with_reallocation' });
assert.equal(allocation.initial.workerTokens.reduce((sum, tokens) => sum + tokens, 0), allocation.initial.pool);
assert.equal(allocation.continuation.workerTokens.reduce((sum, tokens) => sum + tokens, 0), allocation.continuation.pool);
console.log('Token remainders are allocated to workers.');