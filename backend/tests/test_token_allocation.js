const assert = require('assert');
const { buildAllocation, selectSurvivors } = require('../src/services/tokenAllocationService');

const staged = buildAllocation({ totalTokens: 500000, workerShare: 0.6, workerCount: 3, minimumWorkerTokens: 8000, mode: 'successive_halving_with_reallocation' });
assert.deepStrictEqual(staged.initial, { workerCount: 3, pool: 100000, perWorkerTokens: 33333, remainderTokens: 1 });
assert.deepStrictEqual(staged.continuation, { survivorCount: 2, pool: 200000, perWorkerTokens: 100000, remainderTokens: 0 });
assert.deepStrictEqual(
  selectSurvivors([
    { agentId: 'a', status: 'completed', evidenceScore: 1 },
    { agentId: 'a', status: 'completed', evidenceScore: 0.5 },
    { agentId: 'invalid', status: 'completed', evidenceScore: 'unknown' }
  ], 3).map((candidate) => candidate.agentId), ['a']
);
assert.deepStrictEqual(
  selectSurvivors([
    { agentId: 'failed', status: 'failed', evidenceScore: 99 },
    { agentId: 'b', status: 'completed', evidenceScore: 0.6 },
    { agentId: 'a', status: 'idle', evidenceScore: 0.9 }
  ], 2).map((candidate) => candidate.agentId), ['a', 'b']
);
assert.deepStrictEqual(
  selectSurvivors([
    { agentId: 'score-winner', status: 'completed', evidenceScore: 1 },
    { agentId: 'pareto-winner', status: 'completed', evidenceScore: 0.2 }
  ], 1, new Set(['pareto-winner'])).map((candidate) => candidate.agentId), ['pareto-winner']
);
console.log('Token allocation checks passed.');
