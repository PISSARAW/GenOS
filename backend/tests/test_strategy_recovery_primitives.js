const assert = require('node:assert/strict');
const adapter = require('../src/services/strategyExecutionAdapter');
const registry = require('../src/strategies/strategyRegistry');

const handlers = adapter.getHandlers();
for (const primitive of ['production_snapshot', 'snapshot_test', 'restore', 'intervene', 'autopsy']) {
  assert.equal(typeof handlers[primitive], 'function', `${primitive} must be executable`);
}
for (const strategy of registry.listStrategies().filter((item) => [
  'causal_replay_intervention', 'mutated_incident_universes', 'apoptosis'
].includes(item.id))) {
  assert.equal(strategy.missingPrimitives.length, 0, `${strategy.id} must be fully covered`);
}
console.log('Strategy recovery primitive checks passed.');
