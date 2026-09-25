'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { buildActionContext } = require('../bin/orchestratorMissionHelpers.cjs');
const { workerLaunchPayload } = require('../bin/workerLaunchPayload.cjs');

const context = buildActionContext({
  db: null, action: 'dispatch_biological', orchestratorId: 'orch-1',
  request: { executor: 'local' }, task: 'Validate JSON', id: 'orch-1'
});
assert.equal(context.bridgePath, path.resolve(__dirname, '../bin/genos-orchestrate.cjs'));

const worker = workerLaunchPayload({
  context,
  member: { role: 'validator', mission: 'Validate JSON', engine: 'local' },
  workerId: 'worker-1', parent: { workspace_root: '/workspace' }
});
assert.equal(worker.action, 'dispatch_worker');
assert.equal(worker.workerId, 'worker-1');
assert.equal(worker.reuseWorkerId, 'worker-1');
assert.equal(worker.reuseChecked, true);
assert.equal(worker.executor, 'local');
assert.equal(worker.localRuntime, true);

console.log('Topology worker launch payload: PASS');
