'use strict';

const assert = require('node:assert/strict');
const { partitionPareto, reallocateLineageBudget } = require('../src/services/epistemicScheduler');

function lineage(lineageId, budget, metrics) {
  return { lineageId, budget, metrics };
}

const strong = lineage('strong', 100, {
  evidenceStrength: 0.9, novelty: 0.8, coverage: 0.9, leanProgress: 0.8, costEfficiency: 0.7,
});
const dominated = lineage('dominated', 100, {
  evidenceStrength: 0.3, novelty: 0.2, coverage: 0.4, leanProgress: 0.1, costEfficiency: 0.3,
});
const exploratory = lineage('exploratory', 100, {
  evidenceStrength: 0.5, novelty: 1, coverage: 0.4, leanProgress: 0.2, costEfficiency: 0.8,
});

const partition = partitionPareto([strong, dominated, exploratory]);
assert.deepEqual(partition.front.map((item) => item.lineageId), ['strong', 'exploratory']);
assert.deepEqual(partition.dominated.map((item) => item.lineageId), ['dominated']);

const result = reallocateLineageBudget({ lineages: [strong, dominated, exploratory], minimumBudget: 20 });
assert.deepEqual(result.paretoFrontIds, ['exploratory', 'strong']);
assert.deepEqual(result.dominatedIds, ['dominated']);
assert.equal(result.transfers.reduce((sum, item) => sum + item.tokens, 0), 80);
assert.ok(result.transfers.every((item) => item.fromLineageId === 'dominated'));
const budgets = new Map(result.allocations.map((item) => [item.lineageId, item.budget]));
assert.equal(budgets.get('dominated'), 20);
assert.equal([...budgets.values()].reduce((sum, value) => sum + value, 0), 300);
assert.equal(result.conservedTokens, 300);

const stable = reallocateLineageBudget({ lineages: [strong, exploratory], minimumBudget: 20 });
assert.deepEqual(stable.transfers, []);
assert.throws(() => reallocateLineageBudget({ lineages: [strong, strong] }), /unique/);

console.log('Epistemic scheduler Pareto budget reallocation passed.');
