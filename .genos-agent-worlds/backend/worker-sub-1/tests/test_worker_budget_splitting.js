const assert = require('node:assert/strict');

function split(value, count) {
  return Array.from({ length: count }, (_, index) => {
    const base = Math.floor(value / count);
    return base + (index < value - (base * count) ? 1 : 0);
  });
}

assert.deepEqual(split(5, 3), [2, 2, 1]);
assert.deepEqual(split(10, 3), [4, 3, 3]);
assert.equal(split(5, 3).reduce((sum, item) => sum + item, 0), 5);
console.log('Additive worker budgets are split without duplication.');