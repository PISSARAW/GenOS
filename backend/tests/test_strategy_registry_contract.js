const assert = require('node:assert/strict');
const { listStrategies, registryHealth } = require('../src/strategies/strategyRegistry');

const strategies = listStrategies();
const health = registryHealth();
assert.equal(strategies.length, health.total);
assert.equal(strategies.filter((strategy) => strategy.executionStatus === 'partial').every((strategy) => strategy.effectiveMaturity === 'partial'), true);
assert.equal(strategies.filter((strategy) => strategy.executionStatus === 'partial').every((strategy) => strategy.maturity === 'partial'), true);
assert.equal(strategies.filter((strategy) => strategy.executionStatus === 'ready').every((strategy) => strategy.effectiveMaturity === strategy.maturity), true);
console.log('Strategy registry maturity contract checks passed.');
