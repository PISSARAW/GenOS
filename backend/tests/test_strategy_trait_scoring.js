const assert = require('node:assert/strict');
const { listStrategies } = require('../src/strategies/strategyRegistry');
const selector = require('../src/strategies/strategySelector');

const strategies = listStrategies();
const originalRegistry = selector.__strategies;

const profile = selector.profileProblem('production incident', {
  type: 'incident',
  complexity: 0.9,
  uncertainty: 0.9,
  requires_reproducibility: true,
  temporal_dependency: true,
  objectives_conflict: true,
  evaluability: 'deterministic_tests',
  risk: 'high'
});
const deterministic = strategies.find((strategy) => strategy.id === 'deterministic_replay');
assert.ok(deterministic, 'deterministic_replay must remain registered');
assert.ok(deterministic.traits.includes('deterministic'));

const selected = selector.selectStrategyPortfolio({ problem: 'production incident', problemProfile: profile });
assert.ok(selected.portfolio.some((strategy) => strategy.id === 'deterministic_replay'));
assert.equal(originalRegistry, undefined);
console.log('Strategy trait scoring checks passed.');