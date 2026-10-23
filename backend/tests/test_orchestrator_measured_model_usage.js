'use strict';

const assert = require('node:assert/strict');
const { measuredModelUsage } = require('../bin/orchestratorMissionHelpers.cjs');

const runs = [{ id: 'run-a', agent_id: 'worker-a', status: 'completed' },
  { id: 'run-b', agent_id: 'worker-b', status: 'completed' }];
const measured = measuredModelUsage(runs, [
  { run_id: 'run-a', provider_called: 1, input_tokens: 12, output_tokens: 8,
    token_usage_source: 'provider', cost_usd: 0.0042 },
  { run_id: 'run-b', provider_called: 0, input_tokens: 0, output_tokens: 0,
    token_usage_source: 'not_called', cost_usd: null }
]);
assert.equal(measured.complete, true);
assert.equal(measured.totalTokens, 20);
assert.equal(measured.totalCostUsd, 0.0042);

const estimated = measuredModelUsage(runs, [
  { run_id: 'run-a', provider_called: 1, input_tokens: 12, output_tokens: 8,
    token_usage_source: 'estimate', cost_usd: 0.0042 }
], [{ run_id: 'run-a', tokens: 20 }]);
assert.equal(estimated.complete, false);
assert.equal(estimated.totalTokens, null);
assert.equal(estimated.totalCostUsd, null);

const unbound = measuredModelUsage(runs, [], [{ run_id: 'run-a', tokens: 20 }]);
assert.equal(unbound.complete, false);
assert.equal(unbound.totalCostUsd, null);

const failed = measuredModelUsage([{ ...runs[0], status: 'failed' }]);
assert.equal(failed.complete, false);
assert.equal(failed.allRunsCompleted, false);
console.log('Mission usage measurement accepts only run-bound provider receipts.');
