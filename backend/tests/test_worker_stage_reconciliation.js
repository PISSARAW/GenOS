'use strict';

const assert = require('node:assert/strict');
const { counts } = require('../src/services/workerStageReconciliation');

const result = counts({
  workers: [{ agentId: 'failed' }, { agentId: 'complete' }, { agentId: 'pending' }],
  rows: [{ id: 'failed', status: 'error' }, { id: 'complete', status: 'completed' }],
  dispatchFailures: ['failed'],
  startedWorkers: 1
});
assert.deepEqual(result, { startedWorkers: 1, completedWorkers: 1, failedWorkers: 1,
  blockedWorkers: 0, pendingWorkers: 1 });

const distinctFailures = counts({ workers: [{ agentId: 'a' }, { agentId: 'b' }],
  rows: [{ id: 'a', status: 'error' }, { id: 'b', status: 'error' }],
  dispatchFailures: ['a', 'b'] });
assert.equal(distinctFailures.failedWorkers, 2);
assert.equal(distinctFailures.pendingWorkers, 0);
console.log('Worker stage reconciliation deduplicates failed worker IDs: PASS');
