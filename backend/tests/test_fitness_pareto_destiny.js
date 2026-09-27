'use strict';
const assert = require('assert');
const { evaluate } = require('../src/services/fitnessParetoDestinyService');
const result = evaluate([{ id: 'a', fitness: 2, metrics: [2], niche: 'niche-a' }, { id: 'b', fitness: 1, metrics: [1] }, { id: 'unknown' }]);
assert.strictEqual(result.paretoFront.length, 1);
assert.strictEqual(result.promotionAllowed, false);
assert.strictEqual(result.unknown.length, 1);
console.log('✅ fitness pareto destiny tests passed');
