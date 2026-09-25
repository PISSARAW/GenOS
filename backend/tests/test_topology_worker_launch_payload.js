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

const populationContext = {
  ...context,
  request: { ...context.request, mode: 'metapopulation' },
  nceEnrichments: { topology: 'unrelated learned examples' }
};
const populationWorker = workerLaunchPayload({
  context: populationContext,
  member: { role: 'quorum_sensor', mission: 'A=1, B=1. Preserve these exact inputs.', engine: 'cloud' },
  workerId: 'population-worker', parent: { workspace_root: '/workspace' }
});
assert.ok(populationWorker.mission.includes('A=1, B=1. Preserve these exact inputs.'));
assert.ok(populationWorker.mission.includes('METAPOPULATION MIGRATION CONTRACT'));

console.log('Topology worker launch payload: PASS');
