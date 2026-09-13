const assert = require('node:assert/strict');
const { splitBudget } = require('../src/services/agentFleetWorkers');

function split(value, count) {
  return Array.from({ length: count }, (_, index) => splitBudget(value, index, count));
}

function sum(items) {
  return Number(items.reduce((total, item) => total + item, 0).toFixed(6));
}

assert.deepEqual(split(5, 3), [2, 2, 1]);
assert.deepEqual(split(10, 3), [4, 3, 3]);
assert.equal(sum(split(5, 3)), 5);

// Fractional totals must never over-allocate: each worker receives at most the
// exact share, and the residue stays with the first worker.
assert.equal(sum(split(10.5, 3)), 10.5);
assert.equal(sum(split(0.5, 3)), 0.5);
assert.equal(sum(split(0.2, 3)), 0.2);
assert.equal(sum(split(7, 4)), 7);
assert.deepEqual(split(10.5, 3), [4.5, 3, 3]);
assert.equal(splitBudget(0, 0, 3), undefined);
assert.equal(splitBudget(-1, 0, 3), undefined);
console.log('Additive worker budgets are split without duplication.');
