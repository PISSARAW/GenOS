const assert = require('node:assert/strict');
const state = require('../src/services/agentOrchestrationState');
state.emit = () => undefined;

const { assertWorkerDispatchMatches } = require('../src/services/agentRuntimeAdapter/missionWorkers');
const { includePersistedWorkers } = require('../src/services/agentFleetWorkers');
const { dispatchStageWorkers } = require('../src/services/workerEvidenceBarrierPipeline');

assert.doesNotThrow(() => assertWorkerDispatchMatches(
  [{ label: 'one', role: 'reviewer' }, { label: 'two', role: 'writer' }],
  [{ agentId: 'worker-one', label: 'one', role: 'reviewer' }, { agentId: 'worker-two', label: 'two', role: 'writer' }]
));
assert.throws(
  () => assertWorkerDispatchMatches([{}, {}], [{}]),
  (error) => error.code === 'WORKER_DISPATCH_COUNT_MISMATCH'
    && error.selectedWorkers === 2
    && error.createdWorkers === 1
);
async function assertPersistedPartialWorkersAreTracked() {
  const workers = await includePersistedWorkers({
    all: async () => [{ agentId: 'worker-one', name: 'worker', role: 'reviewer' }]
  }, 'root', { workers: [], workerIds: ['worker-one', 'worker-two'] });
  assert.deepEqual(workers.map((worker) => worker.agentId), ['worker-one']);
}

assert.throws(
  () => assertWorkerDispatchMatches([{ label: 'review', role: 'reviewer' }], [{ agentId: 'wrong', label: 'write', role: 'writer' }]),
  (error) => error.code === 'WORKER_DISPATCH_ASSIGNMENT_MISMATCH'
);

async function assertConcurrentDispatch() {
  let active = 0;
  let maximumActive = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const workers = [{ agentId: 'one' }, { agentId: 'two' }];
  const results = await dispatchStageWorkers({ orchestratorId: 'root', stage: 0, stageWorkers: workers }, async () => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    if (active === workers.length) release();
    await gate;
    active -= 1;
  });
  assert.equal(maximumActive, workers.length, 'same-stage worker missions must overlap');
  assert.equal(results.filter((result) => result.ok).length, workers.length);
}

Promise.all([assertConcurrentDispatch(), assertPersistedPartialWorkersAreTracked()])
  .then(() => console.log('Worker dispatch counts reconcile, persisted partial workers are tracked, and same-stage workers run concurrently.'));
