const assert = require('node:assert/strict');
const { listStrategies, registryHealth } = require('../src/strategies/strategyRegistry');

const health = registryHealth();
assert.equal(health.complete, true);
assert.deepEqual(health.missingPrimitives, []);
assert.deepEqual(health.invalidMaturity, []);
assert.deepEqual(health.promotionBlocked, []);
assert.equal(health.partial, 0);
assert.equal(health.ready + health.partial + health.experimental + health.prototype, health.total);
assert.equal(health.ready, health.total);
assert.equal(health.experimental, 0);
assert.equal(health.prototype, 0);
assert.equal(listStrategies().some((strategy) => strategy.maturity === 'experimental'), false);
assert.equal(listStrategies().some((strategy) => strategy.maturity === 'prototype'), false);
assert.equal(listStrategies().every((strategy) => strategy.executionStatus === 'ready'), true);
assert.equal(listStrategies().every((strategy) => ['ready', 'partial', 'experimental', 'prototype'].includes(strategy.maturity)), true);
console.log('Complete strategy maturity registry checks passed.');
