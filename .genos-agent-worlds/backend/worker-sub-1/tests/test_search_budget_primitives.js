const assert = require('node:assert/strict');
const search = require('../src/services/primitiveHandlers/search');
const allocation = require('../src/services/tokenAllocationService');
const arena = require('../src/services/arenaService');

async function main() {
  assert.equal((await search.mctsSelect({ candidates: ['unused'], explorationParam: -1 })).success, false);
  assert.equal((await search.prune({ candidates: ['unused'], k: -1 })).success, false);
  assert.equal((await search.reallocate({ survivors: ['a', 'a'], totalBudget: 10 })).allocations.a, 10);
  assert.equal((await search.reallocate({ survivors: ['a'], totalBudget: -1 })).success, false);
  assert.equal((await search.budgetLimit({ limitType: 'token', currentUsage: 0, maxLimit: 0 })).exceeded, true);
  assert.equal((await search.budgetLimit({ limitType: 'token', currentUsage: 1, maxLimit: -1 })).success, false);

  assert.throws(() => arena.runTournament({ cases: [{ values: [1, 2], target: 2 }] }, ['mcts_solver'], 0), /positive integer/);
  assert.throws(() => arena.runTournament({ cases: [{ values: [2, 1], target: 1 }] }, ['mcts_solver'], 1), /sorted/);
  assert.throws(() => arena.runTournament({ cases: [{ values: [1, 2], target: 2 }] }, ['unknown_solver'], 1), /Unknown solver/);
  const staged = allocation.buildAllocation({ totalTokens: 100, workerShare: 1, workerCount: 3, minimumWorkerTokens: 1, mode: 'successive_halving_with_reallocation' });
  assert.equal(staged.initial.pool + staged.continuation.pool, staged.workerPool);
  console.log('Search and budget primitives: all assertions passed.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });