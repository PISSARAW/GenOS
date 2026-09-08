const assert = require('node:assert/strict');
const adapter = require('../src/services/strategyExecutionAdapter');
const registry = require('../src/strategies/strategyRegistry');

(async () => {
  const ranked = await adapter.executePrimitive('rank_states', { candidates: [{ id: 'a', score: 1 }, { id: 'b', score: 3 }] });
  assert.equal(ranked.best.id, 'b');
  const losers = await adapter.executePrimitive('preserve_losers', { candidates: [{ id: 'a' }, { id: 'b' }], winnerId: 'a' });
  assert.equal(losers.preservedCount, 1);
  const variance = await adapter.executePrimitive('variance_analysis', { values: [1, 2, 3] });
  assert.equal(variance.mean, 2);
  const schedule = await adapter.executePrimitive('temperature_schedule', { iterations: 3, initialTemperature: 1, coolingRate: 0.5 });
  assert.deepEqual(schedule.temperatures, [1, 0.5, 0.25]);
  const allocation = await adapter.executePrimitive('resource_shift', { resources: 10, targets: [{ id: 'a', weight: 1 }, { id: 'b', weight: 3 }] });
  assert.equal(allocation.totalAllocated, 10);
  for (const id of ['beam_search', 'simulated_annealing', 'winner_takes_branch']) {
    assert.equal(registry.getStrategy(id).missingPrimitives.includes('rank_states') || registry.getStrategy(id).missingPrimitives.includes('temperature_schedule') || registry.getStrategy(id).missingPrimitives.includes('preserve_losers'), false);
  }
  console.log('Strategy optimization primitive checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });