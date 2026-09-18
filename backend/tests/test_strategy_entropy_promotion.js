const assert = require('node:assert/strict');
const adapter = require('../src/services/strategyExecutionAdapter');
const { getStrategy } = require('../src/strategies/strategyRegistry');

(async () => {
  const strategy = getStrategy('entropy_model_escalation');
  assert.equal(strategy.maturity, 'implemented');
  assert.equal(strategy.executionStatus, 'ready');
  const low = await adapter.executePrimitive('frontier_escalation', { entropy: 0.2, threshold: 0.7 });
  const high = await adapter.executePrimitive('frontier_escalation', { entropy: 0.9, threshold: 0.7 });
  assert.equal(low.route, 'local');
  assert.equal(high.route, 'frontier');
  assert.equal((await adapter.executePrimitive('entropy_check', { actionHistory: ['a', 'a', 'b'] })).success, true);
  console.log('Entropy escalation promotion checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
