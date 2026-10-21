'use strict';

const assert = require('assert');
const { paginate } = require('./paginate');

assert.deepStrictEqual(paginate([1, 2, 3, 4, 5], 1, 2), [1, 2]);
assert.deepStrictEqual(paginate([1, 2, 3, 4, 5], 2, 2), [3, 4]);
assert.deepStrictEqual(paginate([1, 2, 3, 4, 5], 3, 2), [5]);
assert.deepStrictEqual(paginate([], 1, 2), []);
assert.throws(() => paginate([1], 1, 0), RangeError);
console.log('pagination fixture: 5/5');
