'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const oracles = require('./holdout-oracles/regime-change-oracles.cjs');
const analysis = require('./regime-change-analysis.cjs');
const adapters = require('./comparisonAdapters.cjs');
const { selectFrozen } = require('./run-regime-change-campaign.cjs');

test('regime oracles accept valid candidates and reject violations', () => {
  const cap = { oracle: 'verifyCapacity', oracleParams: { items: [{ id: 'a', w: 2 }, { id: 'b', w: 3 }], bins: 2, cap: 3 } };
  assert.equal(oracles.verifyRegimeCandidate(cap, { bins: [['a'], ['b']] }).passed, true);
  assert.equal(oracles.verifyRegimeCandidate(cap, { bins: [['a', 'b'], []] }).passed, false);
  const dag = { oracle: 'verifyOrder', oracleParams: { steps: ['a', 'b'], edges: [['a', 'b']], revealedEdges: [] } };
  assert.equal(oracles.verifyRegimeCandidate(dag, { order: ['a', 'b'] }).passed, true);
  assert.equal(oracles.verifyRegimeCandidate(dag, { order: ['b', 'a'] }).passed, false);
  assert.throws(() => oracles.verifyRegimeCandidate({ oracle: 'nope' }, {}), /Unknown regime oracle/);
});

test('paired analysis reports a fully positive interval only on real gains', () => {
  const winning = Array.from({ length: 20 }, (_, i) => ({ adaptive: true, control: i < 12 }));
  const stats = analysis.pairedDifference(winning);
  assert.ok(stats.lo > 0);
  const tied = Array.from({ length: 10 }, () => ({ adaptive: true, control: true }));
  assert.equal(analysis.mcnemarP(0, 0), 1);
  assert.ok(analysis.pairedDifference(tied).lo <= 0);
});

test('adapter resolves frozen and imposed topologies per task', () => {
  const task = { adaptedTopology: 'a_team', wrongTopology: 'TriNity' };
  assert.equal(adapters.resolvedTopology({ id: 'genos-wrong' }, task), 'trinity');
  assert.equal(adapters.resolvedTopology({ id: 'genos-frozen', topology: 'biome' }, task), 'biome');
  assert.equal(adapters.resolvedTopology({ id: 'genos-adaptive' }, task), null);
  assert.equal(adapters.resolvedAutonomous({}), true);
  assert.equal(adapters.resolvedAutonomous({ autonomous: false }), false);
});

test('frozen selection prefers pass rate, then tokens, then name', () => {
  const plan = { training: { taskIds: ['train-cap-01'], candidateTopologies: ['trinity', 'a_team', 'biome'] } };
  const attempts = [
    { family: 'regime-cap', topology: 'trinity', oraclePassed: true, tokenUsage: { total: 9 } },
    { family: 'regime-cap', topology: 'a_team', oraclePassed: true, tokenUsage: { total: 5 } },
    { family: 'regime-cap', topology: 'biome', oraclePassed: false, tokenUsage: { total: 1 } }
  ];
  assert.equal(selectFrozen(attempts, plan)['regime-cap'], 'a_team');
});
