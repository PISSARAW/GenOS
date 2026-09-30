const assert = require('node:assert/strict');
const state = require('../src/services/agentOrchestrationState');
state.emit = () => undefined;

const { assertWorkerDispatchMatches } = require('../src/services/agentRuntimeAdapter/missionWorkers');
const missionMorphogenesis = require('../src/services/agentRuntimeAdapter/missionMorphogenesis');
const { bindDispatchAssignments } = require('../src/services/morphogenesis/morphogenesisMissionBinding');
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

async function assertReservationRollback() {
  const pipeline = require('../src/services/workerEvidenceBarrierPipeline');
  const garage = require('../src/services/workerGarageService');
  const originalReserve = garage.reserveSlot;
  const originalRelease = garage.releaseSlot;
  const released = [];
  let reservations = 0;
  const failure = Object.assign(new Error('garage full'), { code: 'WORKER_GARAGE_FULL' });
  garage.reserveSlot = async () => {
    reservations += 1;
    if (reservations === 2) throw failure;
  };
  garage.releaseSlot = async (_db, slot) => {
    released.push(slot.workerId);
    return true;
  };
  try {
    await assert.rejects(() => pipeline.executeWorkerPipeline({
      db: {},
      orchestratorId: 'root',
      workers: [
        { agentId: 'worker-one', label: 'one', name: 'Worker One', role: 'reviewer' },
        { agentId: 'worker-two', label: 'two', name: 'Worker Two', role: 'reviewer' }
      ],
      barrier: { cancelled: false }
    }), (error) => error === failure);
  } finally {
    garage.reserveSlot = originalReserve;
    garage.releaseSlot = originalRelease;
  }
  assert.deepEqual(released, ['worker-one'], 'a failed partial reservation must release earlier slots');
}

function assertMissionMorphogenesisBinding() {
  const assignment = { label: 'review', role: 'independent_reviewer' };
  const context = {
    agentId: 'mission-1',
    db: {},
    normalizedMission: { prompt: 'Review the deployment plan.' },
    contractRecord: { contract: { problem_profile: { domain: 'engineering' } } },
    autonomyPlan: {
      profile: { uncertainty: 0.7 },
      organization: 'specialist_expert_committee',
      dispatchWorkers: [assignment],
      tokenPolicy: { total: 2400 }
    }
  };
  const input = missionMorphogenesis.buildMissionMorphogenesisInput(context);
  assert.equal(input.missionId, 'mission-1');
  assert.equal(input.problem, 'Review the deployment plan.');
  assert.equal(input.problemProfile.domain, 'engineering');
  assert.equal(input.currentState.organization, 'specialist_expert_committee');
  assert.equal(input.budget.tokens, 2400);
  assert.deepEqual(input.missionAssignments, [assignment]);

  const { planMorphogenesis } = require('../src/services/morphogenesis/morphogenesisPlannerService');
  const morphologyPlan = planMorphogenesis(input);
  const morphologyGraph = morphologyPlan.morphologyPatch.graph;
  const morphologyRoot = morphologyGraph.nodes.find((node) => node.nodeId === morphologyGraph.rootNodeId);
  assert.equal(morphologyGraph.missionId, 'mission-1');
  assert.equal(morphologyRoot.mission, 'Review the deployment plan.');
  assert.deepEqual(morphologyRoot.workers, [assignment], 'the planned morphology must carry the actual mission assignments');

  const autonomyPlan = {
    dispatchWorkers: [assignment, { label: 'deferred', role: 'reviewer' }],
    tokenPolicy: {
      total: 2400, workerShare: 0.6, orchestratorReserve: 0.4,
      minimumWorkerTokens: 1, allocation: 'fixed'
    },
    morphogenesisPlan: morphologyPlan
  };
  const bound = bindDispatchAssignments(autonomyPlan, [assignment]);
  assert.equal(bound.binding.graphId, morphologyGraph.graphId);
  assert.deepEqual(morphologyRoot.workers, [assignment]);
  assert.deepEqual(autonomyPlan.dispatchWorkers, bound.assignments, 'dispatch reads assignments from the bound morphology root');
  assert.equal(autonomyPlan.tokenPolicy.rounds.initial.workerTokens.length, 1, 'capped assignments receive a matching token allocation');
}

Promise.all([assertConcurrentDispatch(), assertPersistedPartialWorkersAreTracked(), assertReservationRollback()])
  .then(() => assertMissionMorphogenesisBinding())
  .then(() => console.log('Worker dispatch reconciles, rolls back reservations, and binds live assignments to mission Morphogenesis.'));
