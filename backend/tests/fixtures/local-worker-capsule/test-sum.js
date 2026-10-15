'use strict';

const assert = require('node:assert/strict');
const { sum } = require('./buggy-sum');

assert.equal(sum(2, 3), 5);
assert.equal(sum(-1, 1), 0);
console.log('sum checks passed');
