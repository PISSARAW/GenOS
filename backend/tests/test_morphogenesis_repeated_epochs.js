'use strict';

const assert = require('node:assert/strict');
const budgetController = require('../src/services/morphogenesis/morphogenesisEpochBudget');
const { registerRoundResult } = require('../src/services/agentRoundService');
const { advanceAutonomousRound } = require('../src/services/agentRoundService');
const { autonomousRounds, activeProcesses, pendingContinuations } = require('../src/services/agentOrchestrationState');
const { verifiedResolution } = require('../src/services/morphogenesis/missionResolutionReceipt');
const morphogenesisContinuation = require('../src/services/morphogenesis/missionMorphogenesisContinuation');
const durableContinuation = require('../src/services/durableContinuationService');
const continuationQueue = require('../src/services/agentContinuationQueueService');

function verifyBudgetCycles() {
  let budget = budgetController.createEpochBudget(100, {}, 10);
  const reservations = [];
  while (true) {
    const reservation = budgetController.reserveEpoch(budget, 3);
    if (reservation.status !== 'reserved') {
      assert.equal(reservation.reason, 'budget_below_minimum_tranche');
      break;
    }
    reservations.push(reservation);
    assert.ok(reservation.perWorkerTokens >= 10);
    budget = budgetController.settleEpoch(reservation.budget, reservation.epoch, 'evaluated');
  }
  assert.equal(reservations.length, 3, 'budget supports repeated epochs until no three-worker tranche fits');
  assert.equal(budget.remaining, 1, 'rounding dust stays visible and is never allocated below the minimum');
  assert.deepEqual(budget.history.map((entry) => entry.epoch), [1, 2, 3]);
}

function verifyConfiguredStopAndReservationSafety() {
  let budget = budgetController.createEpochBudget(90, { maxEpochs: 2 }, 10);
  const first = budgetController.reserveEpoch(budget, 3);
  assert.equal(first.status, 'reserved');
  assert.equal(budgetController.reserveEpoch(first.budget, 3).reason, 'epoch_already_active');
  budget = budgetController.settleEpoch(first.budget, first.epoch, 'evaluated');
  const second = budgetController.reserveEpoch(budget, 3);
  assert.equal(second.status, 'reserved');
  budget = budgetController.settleEpoch(second.budget, second.epoch, 'evaluated');
  assert.equal(budgetController.reserveEpoch(budget, 1).reason, 'epoch_limit_reached');
  assert.equal(budgetController.settleEpoch(budget, 9, 'evaluated').reason, 'epoch_identity_mismatch');
  assert.equal(budgetController.reserveEpoch(budgetController.createEpochBudget(90, { maxEpochs: 0 }, 10), 1).reason,
    'epoch_limit_reached', 'an explicit zero epoch limit disables continuation');
}

function verifyRoundBarrierAndStaleEpochRejection() {
  const id = `epoch-test-${Date.now()}`;
  const state = { epoch: 2, workerIds: new Set(['w1', 'w2']), results: new Map(), advanced: false };
  autonomousRounds.set(id, state);
  try {
    assert.equal(registerRoundResult({ agentId: 'w1', budgetRound: { stage: 'morphogenesis_epoch', epoch: 1, orchestratorId: id } },
      { eventType: 'AGENT_COMPLETED', payload: {} }), null, 'late events from a prior epoch are ignored');
    assert.equal(registerRoundResult({ agentId: 'w1', budgetRound: { stage: 'morphogenesis_epoch', epoch: 2, orchestratorId: id } },
      { eventType: 'AGENT_COMPLETED', payload: {} }), null);
    const completed = registerRoundResult({ agentId: 'w2', budgetRound: { stage: 'morphogenesis_epoch', epoch: 2, orchestratorId: id } },
      { eventType: 'AGENT_COMPLETED', payload: {} });
    assert.equal(completed.state, state);
    assert.equal(state.advanced, true, 'the next epoch is evaluated only after every dispatched worker reports');
    assert.equal(registerRoundResult({ agentId: 'w1', budgetRound: { stage: 'morphogenesis_epoch', epoch: 2, orchestratorId: id } },
      { eventType: 'AGENT_COMPLETED', payload: {} }), null, 'duplicate reports cannot advance the same epoch twice');
  } finally {
    autonomousRounds.delete(id);
  }
}

async function verifyMissingVerifierCannotResolve() {
  const state = { normalizedMission: { workspaceRoot: process.cwd(), verifierChecks: [{ program: 'node', args: ['-v'] }] },
    results: new Map([['worker', { agentId: 'worker', status: 'completed', payload: { evidenceReport: { outcome: 'success' } } }]]) };
  assert.equal(await verifiedResolution(state, 'mission'), null,
    'a worker success report without an independent verifier receipt cannot resolve the mission');
}

async function verifyActualRepeatedCycle() {
  const id = `epoch-cycle-${Date.now()}`;
  const workerIds = ['cycle-worker-1', 'cycle-worker-2'];
  const originalPlanner = morphogenesisContinuation.planContinuation;
  const originalPersist = durableContinuation.persistContinuations;
  const plannerCalls = [];
  morphogenesisContinuation.planContinuation = async (input) => {
    plannerCalls.push(input.state.epochBudget.reservedEpochs + 1);
    return { adapted: true, receipt: { operator: 'COMPETE', selectedTopology: 'biocenose' },
      assignments: Object.fromEntries(input.survivors.map((worker, index) => [worker.agentId, {
        morphologyTopology: index ? 'rhizome' : 'biocenose', morphologyNodeId: `node-${index}`,
        morphologyVariant: 'default', role: workerIds[index]
      }])) };
  };
  durableContinuation.persistContinuations = async ({ continuations }) => continuations.map((item) => item.id);
  for (const workerId of workerIds) activeProcesses.set(workerId, Promise.resolve());
  const state = { plan: { tokenPolicy: { allocation: 'weighted', minimumWorkerTokens: 10,
      rounds: { initial: { pool: 100 }, continuation: { pool: 100, survivorCount: 2, perWorkerTokens: 10 } },
    }, selectedTopology: 'a_team', profile: {} },
    normalizedMission: { missionId: id, prompt: 'Solve under changing evidence.', workspaceRoot: null, verifierChecks: [] },
    workers: new Map(workerIds.map((agentId) => [agentId, { agentId, role: 'worker', workerKind: 'scout_cell',
      prompt: 'Initial mission', executionBudget: { tokens: 20, events: 10, costUsd: 1 } }])),
    workerIds: new Set(workerIds), results: new Map(), epoch: 0,
    epochBudget: budgetController.createEpochBudget(100, {}, 10), advanced: false };
  autonomousRounds.set(id, state);
  try {
    for (const agentId of workerIds) {
      await advanceAutonomousRound({ agentId, budgetRound: { stage: 'initial', orchestratorId: id } },
        { eventType: 'AGENT_COMPLETED', payload: { result: `result-${agentId}` } });
    }
    assert.equal(state.epoch, 1);
    assert.equal(state.plan.morphogenesisEpochStatus.status, 'running');
    assert.equal(pendingContinuations.get(workerIds[0]).budgetRound.epoch, 1);
    for (const agentId of workerIds) {
      await advanceAutonomousRound({ agentId, budgetRound: { stage: 'morphogenesis_epoch', epoch: 1, orchestratorId: id } },
        { eventType: 'AGENT_COMPLETED', payload: { result: `epoch-1-${agentId}` } });
    }
    assert.equal(state.epoch, 2, 'a second full observe/adapt/act cycle must run');
    assert.deepEqual(plannerCalls, [1, 2]);
    assert.equal(state.plan.morphogenesisEpochStatus.epoch, 2);
  } finally {
    morphogenesisContinuation.planContinuation = originalPlanner;
    durableContinuation.persistContinuations = originalPersist;
    autonomousRounds.delete(id);
    for (const workerId of workerIds) {
      activeProcesses.delete(workerId);
      pendingContinuations.delete(workerId);
    }
  }
}

async function verifyPersistenceFailureDoesNotQueue() {
  const workerId = `persist-worker-${Date.now()}`;
  const persist = durableContinuation.persistContinuations;
  durableContinuation.persistContinuations = async () => { throw new Error('storage unavailable'); };
  try {
    const state = { db: {}, workers: new Map([[workerId, { agentId: workerId, prompt: 'work', executionBudget: {} }]]) };
    await assert.rejects(continuationQueue.queueContinuationMissions([{
      state, survivor: { agentId: workerId, payload: {} }, continuation: { perWorkerTokens: 10 },
      index: 0, orchestratorId: 'persist-orchestrator'
    }]), /storage unavailable/);
    assert.equal(pendingContinuations.has(workerId), false,
      'failed durable write must not expose a dispatchable local continuation');
  } finally {
    durableContinuation.persistContinuations = persist;
    pendingContinuations.delete(workerId);
  }
}

async function verifyPlannerFailureReleasesReservation() {
  const id = `epoch-planner-failure-${Date.now()}`;
  const workerIds = ['planner-worker-1', 'planner-worker-2'];
  const originalPlanner = morphogenesisContinuation.planContinuation;
  morphogenesisContinuation.planContinuation = async () => { throw new Error('planner unavailable'); };
  const state = { plan: { tokenPolicy: { minimumWorkerTokens: 10,
      rounds: { initial: { pool: 100 }, continuation: { pool: 100, survivorCount: 2, perWorkerTokens: 10 } } },
    selectedTopology: 'a_team', profile: {} },
    normalizedMission: { missionId: id, prompt: 'Recover safely.', workspaceRoot: null, verifierChecks: [] },
    workers: new Map(workerIds.map((agentId) => [agentId, { agentId, role: 'worker', workerKind: 'scout_cell',
      prompt: 'Initial mission', executionBudget: { tokens: 20, events: 10, costUsd: 1 } }])),
    workerIds: new Set(workerIds), results: new Map(), epoch: 0,
    epochBudget: budgetController.createEpochBudget(100, {}, 10), advanced: false };
  autonomousRounds.set(id, state);
  try {
    for (const agentId of workerIds) {
      await advanceAutonomousRound({ agentId, budgetRound: { stage: 'initial', orchestratorId: id } },
        { eventType: 'AGENT_COMPLETED', payload: { result: `result-${agentId}` } });
    }
    assert.equal(state.epochBudget.remaining, 100, 'planner failure refunds the reserved tranche');
    assert.equal(state.epochBudget.activeEpoch, null);
    assert.equal(state.epochBudget.reservedEpochs, 0);
    assert.equal(state.plan.morphogenesisEpochStatus.status, 'stopped');
    assert.equal(state.plan.morphogenesisEpochStatus.reason, 'adaptation_failed');
    assert.equal(autonomousRounds.has(id), false, 'failed reconfiguration terminates the autonomous round');
  } finally {
    morphogenesisContinuation.planContinuation = originalPlanner;
    autonomousRounds.delete(id);
  }
}

async function run() {
  verifyBudgetCycles();
  verifyConfiguredStopAndReservationSafety();
  verifyRoundBarrierAndStaleEpochRejection();
  await verifyMissingVerifierCannotResolve();
  await verifyActualRepeatedCycle();
  await verifyPersistenceFailureDoesNotQueue();
  await verifyPlannerFailureReleasesReservation();
  console.log('Morphogenesis repeated epochs: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
