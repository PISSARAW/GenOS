const assert = require('node:assert/strict');
const { listStrategies, registryHealth } = require('../src/strategies/strategyRegistry');

const health = registryHealth();
assert.equal(health.complete, true);
assert.deepEqual(health.missingPrimitives, []);
assert.equal(health.partial, 0);
assert.equal(listStrategies().some((strategy) => strategy.maturity === 'experimental'), false);
assert.equal(listStrategies().some((strategy) => strategy.maturity === 'prototype'), false);
assert.equal(listStrategies().every((strategy) => strategy.executionStatus === 'ready'), true);
console.log('Complete strategy maturity registry checks passed.');
