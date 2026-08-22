const assert = require('node:assert/strict');
const { finalPrice } = require('./discount');

assert.equal(finalPrice(100, true), 80, 'member boundary at 100');
assert.equal(finalPrice(101, true), 80.8, 'member above threshold');
assert.equal(finalPrice(99.5, true), 99.5, 'member below threshold');
assert.equal(finalPrice(100, false), 100, 'non-member boundary');
assert.throws(() => finalPrice(-1, true), /non-negative/);

console.log('5/5 tests passed');
