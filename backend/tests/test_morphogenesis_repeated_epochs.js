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
const { arbitrateGroupNeeds } = require('../src/services/morphogenesis/groupResourceNegotiation');

function quiescentDatabase() {
  return {
    all: async (_sql, _parentId, ...ids) => ids.map((id) => ({ id, status: 'completed', runtime_pid: null, leased: 0 })),
    get: async () => ({ agent_type: 'GenOS' })
  };
}

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
  const originalMark = durableContinuation.markContinuation;
  const fleet = require('../src/services/agentFleetService');
  const roundService = require('../src/services/agentRoundService');
  const originalResume = roundService.resumeMorphogenesisBarrier;
  const originalCreate = fleet.createAutonomousWorkers;
  const plannerCalls = [];
  const createdIds = [];
  morphogenesisContinuation.planContinuation = async (input) => {
    plannerCalls.push(input.state.epochBudget.reservedEpochs + 1);
    const roster = [
      { candidateId: 'strategy-scout', role: 'strategy_scout', workerKind: 'scout_cell',
        morphologyTopology: 'biocenose', capabilities: ['execute'], tools: [] },
      { candidateId: 'causal-reviewer', role: 'causal_reviewer', workerKind: 'red_worker',
        morphologyTopology: 'rhizome', capabilities: ['execute'], tools: [] },
      { candidateId: 'proof-auditor', role: 'proof_auditor', workerKind: 'verifier_worker',
        morphologyTopology: 'biocenose', capabilities: ['execute'], tools: [] }
    ];
    return { adapted: true, receipt: { operator: 'COMPETE', selectedTopology: 'biocenose' },
      assignments: Object.fromEntries(roster.map((worker, index) => [worker.candidateId, {
        ...worker, morphologyNodeId: `node-${index}`, morphologyVariant: 'default'
      }])),
      cohortBlueprint: { assignments: roster.map((worker, index) => ({
        ...worker, morphologyNodeId: `node-${index}`, morphologyVariant: 'default', tokenBudget: 0
      })) } };
  };
  fleet.createAutonomousWorkers = async (_db, _orchestrator, options) => {
    assert.equal(options.plan.morphogenesisCohort, true);
    assert.equal(options.plan.nativeMissionPlan, undefined, 'cohort recruitment keeps standard fan-out validation');
    return options.plan.dispatchWorkers.map((assignment) => {
      const agentId = assignment.workerId;
      createdIds.push(agentId);
      activeProcesses.set(agentId, Promise.resolve());
      return { ...assignment, agentId, prompt: 'recruited',
        executionBudget: { tokens: assignment.tokenBudget, events: 10, costUsd: 1 }, toolLease: [] };
    });
  };
  durableContinuation.persistContinuations = async ({ continuations }) => continuations.map((item) => item.id);
  durableContinuation.markContinuation = async () => {};
  for (const workerId of workerIds) activeProcesses.set(workerId, Promise.resolve());
  const state = { db: quiescentDatabase(), plan: { tokenPolicy: { allocation: 'weighted', minimumWorkerTokens: 10,
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
    assert.equal(await roundService.resumeMorphogenesisBarrier(id), false,
      'an active worker keeps the barrier closed even after every terminal report');
    assert.equal(state.epoch, 0, 'the last report only marks the barrier ready while workers are still closing');
    assert.equal(state.roundPhase, 'barrier_ready');
    for (const workerId of workerIds) activeProcesses.delete(workerId);
    await roundService.resumeMorphogenesisBarrier(id);
    assert.equal(state.epoch, 1, JSON.stringify(state.plan.morphogenesisEpochStatus));
    assert.equal(state.plan.morphogenesisEpochStatus.status, 'running');
    const firstCohortIds = [...state.workerIds];
    assert.equal(firstCohortIds.length, 3, 'epoch one can recruit more workers than the two surviving workers');
    assert.ok(firstCohortIds.every((workerId) => !workerIds.includes(workerId)));
    assert.equal(state.morphogenesisCohorts[0].workerIds.length, 3);
    assert.deepEqual(state.morphogenesisCohorts[0].workerIds.map((workerId) =>
      state.workers.get(workerId).workerKind).sort(), ['red_worker', 'scout_cell', 'verifier_worker']);
    assert.equal(pendingContinuations.get(firstCohortIds[0]).budgetRound.epoch, 1);
    assert.equal(pendingContinuations.get(firstCohortIds[0]).morphologyTopology, 'biocenose',
      'the recruited identity receives the selected morphology in its persisted mission');
    for (const workerId of firstCohortIds) pendingContinuations.delete(workerId);
    for (const agentId of [...state.workerIds]) {
      await advanceAutonomousRound({ agentId, budgetRound: { stage: 'morphogenesis_epoch', epoch: 1, orchestratorId: id } },
        { eventType: 'AGENT_COMPLETED', payload: { result: `epoch-1-${agentId}` } });
    }
    assert.equal(state.epoch, 1, 'the next epoch cannot start before the recruited workers close');
    for (const workerId of firstCohortIds) activeProcesses.delete(workerId);
    assert.equal(await roundService.resumeMorphogenesisBarrier(id), true,
      'worker closure releases the next morphogenetic epoch');
    assert.equal(state.epoch, 2, `a second full observe/adapt/act cycle must run: ${JSON.stringify(state.plan.morphogenesisEpochStatus)}`);
    assert.equal(state.workerIds.size, 3);
    assert.ok([...state.workerIds].every((workerId) => !firstCohortIds.includes(workerId)));
    assert.deepEqual(plannerCalls, [1, 2]);
    assert.equal(state.plan.morphogenesisEpochStatus.epoch, 2);
  } finally {
    morphogenesisContinuation.planContinuation = originalPlanner;
    fleet.createAutonomousWorkers = originalCreate;
    durableContinuation.persistContinuations = originalPersist;
    durableContinuation.markContinuation = originalMark;
    roundService.resumeMorphogenesisBarrier = originalResume;
    autonomousRounds.delete(id);
    for (const workerId of [...workerIds, ...createdIds]) {
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
  const roundService = require('../src/services/agentRoundService');
  morphogenesisContinuation.planContinuation = async () => { throw new Error('planner unavailable'); };
  const state = { plan: { tokenPolicy: { minimumWorkerTokens: 10,
      rounds: { initial: { pool: 100 }, continuation: { pool: 100, survivorCount: 2, perWorkerTokens: 10 } } },
    selectedTopology: 'a_team', profile: {} },
    db: quiescentDatabase(), normalizedMission: { missionId: id, prompt: 'Recover safely.', workspaceRoot: null, verifierChecks: [] },
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
    assert.equal(state.epoch, 0, 'terminal reports only mark the barrier; adaptation waits for worker closure');
    await roundService.resumeMorphogenesisBarrier(id);
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

async function verifyMarginalGroupBudgetSleepsTheUnfundedGroup() {
  const id = `epoch-group-arbitration-${Date.now()}`;
  const workerIds = ['alpha-worker', 'beta-worker'];
  const originalPlanner = morphogenesisContinuation.planContinuation;
  const originalPersist = durableContinuation.persistContinuations;
  const originalMark = durableContinuation.markContinuation;
  const runtimeAdapter = require('../src/services/agentRuntimeAdapter');
  const originalStartMission = runtimeAdapter.startMission;
  const roundService = require('../src/services/agentRoundService');
  const persistedIds = [];
  morphogenesisContinuation.planContinuation = async (input) => ({ adapted: false,
    reason: 'adaptation_not_required', decision: { resources: arbitrateGroupNeeds({ budget: input.continuation.pool,
      groups: [
        { id: 'alpha', needs: [{ id: 'critical', requestedTokens: 30, minimumTokens: 10,
          marginalValue: 0.95, confidence: 1, evidenceRefs: ['receipt:critical'] }] },
        { id: 'beta', needs: [{ id: 'routine', requestedTokens: 30, minimumTokens: 10,
          marginalValue: 0.2, confidence: 1, evidenceRefs: ['receipt:routine'] }] }
      ] }) } });
  durableContinuation.persistContinuations = async ({ continuations }) => {
    persistedIds.push(...continuations.map((item) => item.agentId));
    return continuations.map((item) => item.id);
  };
  durableContinuation.markContinuation = async () => {};
  runtimeAdapter.startMission = async () => {};
  workerIds.forEach((workerId) => activeProcesses.set(workerId, Promise.resolve()));
  const state = { plan: { tokenPolicy: { minimumWorkerTokens: 10,
      rounds: { initial: { pool: 100 }, continuation: { pool: 100, survivorCount: 2, perWorkerTokens: 10 } } },
    selectedTopology: 'a_team' },
    db: quiescentDatabase(), normalizedMission: { missionId: id, prompt: 'Route budget by evidence-backed group value.', verifierChecks: [] },
    workers: new Map(workerIds.map((agentId, index) => [agentId, { agentId, role: index ? 'beta' : 'alpha',
      groupId: index ? 'beta' : 'alpha', workerKind: 'bounded_worker', prompt: 'work', executionBudget: {} }])),
    workerIds: new Set(workerIds), results: new Map(), epoch: 0,
    epochBudget: budgetController.createEpochBudget(100, {}, 10), advanced: false };
  autonomousRounds.set(id, state);
  try {
    for (const agentId of workerIds) await advanceAutonomousRound(
      { agentId, budgetRound: { stage: 'initial', orchestratorId: id } },
      { eventType: 'AGENT_COMPLETED', payload: {} });
    assert.equal(state.roundPhase, 'barrier_ready', 'the coordinator waits for worker process closure');
    assert.equal(await roundService.resumeMorphogenesisBarrier(id), false,
      'active workers prevent a group budget decision from dispatching');
    assert.equal(state.epoch, 0, 'the terminal event does not dispatch before the close barrier');
    for (const workerId of workerIds) activeProcesses.delete(workerId);
    assert.equal(await roundService.resumeMorphogenesisBarrier(id), true,
      'closing both workers releases the group budget decision');
    assert.equal(state.epoch, 1, JSON.stringify({ status: state.plan.morphogenesisEpochStatus,
      budget: state.epochBudget, workers: [...state.workerIds] }));
    assert.deepEqual([...state.workerIds], ['alpha-worker'],
      'the next epoch contains the funded group only; the other group sleeps at the barrier');
    assert.ok(persistedIds.includes('alpha-worker'), 'funded group continuation is durably queued');
    assert.ok(!persistedIds.includes('beta-worker'), 'unfunded group receives no continuation');
    assert.equal(pendingContinuations.has('beta-worker'), false);
  } finally {
    morphogenesisContinuation.planContinuation = originalPlanner;
    durableContinuation.persistContinuations = originalPersist;
    durableContinuation.markContinuation = originalMark;
    runtimeAdapter.startMission = originalStartMission;
    autonomousRounds.delete(id);
    for (const workerId of workerIds) {
      activeProcesses.delete(workerId);
      pendingContinuations.delete(workerId);
    }
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
  await verifyMarginalGroupBudgetSleepsTheUnfundedGroup();
  console.log('Morphogenesis repeated epochs: PASS');
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
