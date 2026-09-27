'use strict';
const assert = require('assert');
const { compareOperators, validateComparison } = require('../src/services/morphogenesisBenchmarkService');
const result = compareOperators({ baseline: 1, budget: 10, operators: [{ id: 'a', score: 2, cost: 5 }, { id: 'b', score: 3, cost: 20 }] });
assert.strictEqual(result.winner.id, 'a');
assert.strictEqual(validateComparison(result).valid, true);
assert.strictEqual(validateComparison({ ...result, reservedUntouched: false }).valid, false);
console.log('✅ morphogenesis benchmark tests passed');
