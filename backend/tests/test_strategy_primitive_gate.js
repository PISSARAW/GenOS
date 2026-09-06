const assert = require('node:assert/strict');
const strategy = require('../src/services/strategyExecutionService');

assert.equal(strategy.primitiveFailureReason({ stage_key: 'snapshot' }, { success: true }), null);
assert.match(
  strategy.primitiveFailureReason({ stage_key: 'snapshot' }, { success: false, error: 'workspaceId required' }),
  /snapshot.*workspaceId required/
);
console.log('Failed strategy primitives block their phase.');