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
  context: { ...context, topologySession: { sessionId: 'syncytium:assignment:1', revision: 2 } },
  member: { role: 'verifier', mission: 'Validate JSON', engine: 'local' },
  workerId: 'worker-1', parent: { workspace_root: '/workspace' }
});
assert.equal(worker.action, 'dispatch_worker');
assert.equal(worker.workerId, 'worker-1');
assert.equal(worker.reuseWorkerId, 'worker-1');
assert.equal(worker.reuseChecked, true);
assert.equal(worker.executor, 'local');
assert.equal(worker.localRuntime, true);
assert.equal(worker.topologySessionId, 'syncytium:assignment:1');

const populationContext = {
  ...context,
  request: { ...context.request, mode: 'metapopulation' },
  nceEnrichments: { topology: 'unrelated learned examples' }
};
const populationWorker = workerLaunchPayload({
  context: populationContext,
  member: { role: 'quorum_sensor', workerKind: 'scout_cell', mission: 'A=1, B=1. Preserve these exact inputs.', engine: 'cloud' },
  workerId: 'population-worker', parent: { workspace_root: '/workspace' }
});
assert.ok(populationWorker.mission.includes('A=1, B=1. Preserve these exact inputs.'));
assert.ok(populationWorker.mission.includes('METAPOPULATION MIGRATION CONTRACT'));

const baselineWorker = workerLaunchPayload({
  context: { ...context, request: { ...context.request, mode: 'isolated_baseline' } },
  member: { role: 'verifier', mission: 'Independent baseline', engine: 'cloud' },
  workerId: 'baseline-worker', parent: { workspace_root: '/workspace' },
  toolLease: ['genos_snapshot', 'genos_worker_publish', 'genos_worker_inbox', 'genos_topology_session', 'genos_change_organization']
});
assert.ok(baselineWorker.mission.includes('ISOLATED BASELINE'));
assert.deepEqual(baselineWorker.toolLease, ['genos_snapshot']);

const localModelWorker = workerLaunchPayload({
  context: { ...context, request: { ...context.request, executor: undefined, localModel: 'ollama://qwen2.5-coder:7b' } },
  member: { role: 'analyst', mission: 'Analyze evidence', engine: 'cloud' },
  workerId: 'local-model-worker', parent: { workspace_root: '/workspace' }
});
assert.equal(localModelWorker.executor, 'local');
assert.equal(localModelWorker.localRuntime, true);
assert.equal(localModelWorker.localModel, 'ollama://qwen2.5-coder:7b');
assert.equal(localModelWorker.localRoutingPolicy.primary, 'ollama://qwen2.5-coder:7b');

console.log('Topology worker launch payload: PASS');
