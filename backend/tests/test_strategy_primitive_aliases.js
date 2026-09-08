const assert = require('node:assert/strict');
const adapter = require('../src/services/strategyExecutionAdapter');
const registry = require('../src/strategies/strategyRegistry');

const handlers = adapter.getHandlers();
for (const primitive of ['diff', 'audit', 'tests', 'blast_radius', 'uncertainty_limit']) {
  assert.equal(typeof handlers[primitive], 'function', `${primitive} must be executable`);
}

const partial = registry.listStrategies().filter((strategy) => strategy.missingPrimitives.includes('diff'));
assert.equal(partial.length, 0, 'strategies using diff must be fully covered');
console.log('Strategy primitive alias checks passed.');