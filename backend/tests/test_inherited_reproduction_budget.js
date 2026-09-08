const assert = require('node:assert/strict');
const { calculateInheritedCognitiveBudget } = require('../src/services/agentFleetService');

assert.equal(calculateInheritedCognitiveBudget(100, 0.6, 3), 20);
assert.equal(calculateInheritedCognitiveBudget(20, 0.5, 2), 5);
assert.equal(calculateInheritedCognitiveBudget(100, 2, 2), 50, 'worker share is capped at 100%');
assert.equal(calculateInheritedCognitiveBudget(100, -1, 2), 0, 'negative worker share cannot create budget');
assert.equal(calculateInheritedCognitiveBudget(100, 0.6, 0), 60, 'worker count is normalized to one');
console.log('Inherited reproduction budget contract passed.');
