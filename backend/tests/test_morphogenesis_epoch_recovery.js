'use strict';

const assert = require('node:assert/strict');
const { openDatabase } = require('./helpers/biologyDatabase');
const recovery = require('../src/services/morphogenesis/morphogenesisEpochRecovery');
const { autonomousRounds } = require('../src/services/agentOrchestrationState');
const { registerRoundResult } = require('../src/services/agentRoundService');
const budget = require('../src/services/morphogenesis/morphogenesisEpochBudget');
const { advanceAutonomousRound } = require('../src/services/agentRoundService');

async function main() {
  const db = openDatabase();
  await db.exec(`CREATE TABLE continuation_queue (id TEXT PRIMARY KEY, agent_id TEXT, orchestrator_id TEXT,
    mission_json TEXT, status TEXT, organization_id TEXT, project_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    available_at TEXT DEFAULT CURRENT_TIMESTAMP)`);
  const orchestratorId = 'durable-epoch-controller';
  const scope = { missionId: 'durable-epoch-mission', organizationId: 'org-a', projectId: 'project-a' };
  const workers = [['durable-worker-a', { agentId: 'durable-worker-a', role: 'analyst' }],
    ['durable-worker-b', { agentId: 'durable-worker-b', role: 'verifier' }]];
  const state = { orchestratorId, db, checkpointScope: scope, organizationId: scope.organizationId, projectId: scope.projectId,
    plan: { tokenPolicy: { minimumWorkerTokens: 5 } }, normalizedMission: { missionId: scope.missionId },
    workers: new Map(workers), workerIds: new Set(workers.map(([id]) => id)), results: new Map(),
    epoch: 0, epochBudget: budget.createEpochBudget(40, {}, 5), advanced: false };
  autonomousRounds.set(orchestratorId, state);
  try {
    await recovery.registerInitialRound(state);
    const firstMission = { agentId: 'durable-worker-a', db,
      budgetRound: { stage: 'initial', orchestratorId, ...scope } };
    const firstEvent = { eventType: 'AGENT_COMPLETED', payload: { evidence: 'first' } };
    await advanceAutonomousRound(firstMission, firstEvent);
    const firstCheckpoint = await require('../src/services/morphogenesis/morphogenesisEpochStore')
      .loadCheckpoint(db, scope);
    assert.equal(firstCheckpoint.results.length, 1, 'terminal reports are checkpointed as they arrive');
    autonomousRounds.delete(orchestratorId);

    const restored = await recovery.restoreRound({ ...firstMission,
      budgetRound: { ...firstMission.budgetRound, stage: 'initial' } });
    assert.ok(restored);
    assert.equal(restored.epochBudget.total, 40);
    assert.equal(restored.workers.size, 2);
    assert.equal(restored.results.get('durable-worker-a').status, 'completed');
    assert.equal(restored.roundPhase, 'collecting');

    const second = registerRoundResult({ agentId: 'durable-worker-b', budgetRound: {
      stage: 'initial', orchestratorId } }, { eventType: 'AGENT_COMPLETED', payload: { evidence: 'second' } });
    assert.equal(second.state, restored, 'restored barrier accepts the outstanding worker result');
    assert.equal(restored.advanced, true);

    restored.roundPhase = 'advancing';
    await recovery.persistRound(restored, 'simulated-crash-during-transition', 'advancing');
    autonomousRounds.delete(orchestratorId);
    const interrupted = await recovery.restoreRound({ ...firstMission,
      budgetRound: { ...firstMission.budgetRound, stage: 'initial' } });
    interrupted.roundPhase = 'advancing';
    const stateModule = require('../src/services/agentOrchestrationState');
    const originalEmit = stateModule.emit;
    stateModule.emit = () => {};
    try {
      assert.equal(await recovery.markRecoveryRequired(interrupted, orchestratorId), true);
    } finally {
      stateModule.emit = originalEmit;
    }
    const checkpointStore = require('../src/services/morphogenesis/morphogenesisEpochStore');
    const blocked = await checkpointStore.loadCheckpoint(db, scope);
    assert.equal(blocked.phase, 'recovery_required');
    assert.equal(blocked.state.plan.morphogenesisEpochStatus.reason,
      'interrupted_during_advancement_requires_operator_resume');
    assert.equal(autonomousRounds.has(orchestratorId), true,
      'an interrupted transition remains resumable for an operator and cannot redispatch twice');
    const roundService = require('../src/services/agentRoundService');
    const originalResume = roundService.resumeMorphogenesisBarrier;
    let resumeCalled = false;
    roundService.resumeMorphogenesisBarrier = async () => { resumeCalled = true; };
    let resumed;
    try {
      resumed = await recovery.requestOperatorResume(db, scope);
    } finally {
      roundService.resumeMorphogenesisBarrier = originalResume;
    }
    assert.equal(resumed.phase, 'barrier_ready');
    assert.equal(resumeCalled, true, 'operator resume re-enters the coordinator without waiting for another worker report');
    await assert.rejects(() => recovery.requestOperatorResume(db, scope), error =>
      error.code === 'MORPHOGENESIS_RESUME_NOT_REQUIRED');
    await verifyQueuedAdvancingRecovery(db);
  } finally {
    autonomousRounds.delete(orchestratorId);
    await db.close();
  }
  console.log('Morphogenesis epoch recovery restores mission maps, results and budget after controller state loss.');
}

async function verifyQueuedAdvancingRecovery(db) {
  const orchestratorId = 'queued-epoch-controller';
  const scope = { missionId: 'queued-epoch-mission', organizationId: 'org-a', projectId: 'project-a' };
  const state = { db, checkpointScope: scope, organizationId: scope.organizationId, projectId: scope.projectId,
    plan: { tokenPolicy: { minimumWorkerTokens: 5 } }, normalizedMission: { missionId: scope.missionId },
    workers: new Map([['old-worker', { agentId: 'old-worker' }]]), workerIds: new Set(['old-worker']),
    results: new Map([['old-worker', { agentId: 'old-worker', status: 'completed', payload: {} }]]),
    epoch: 0, epochBudget: budget.createEpochBudget(40, {}, 5), advanced: true };
  await recovery.registerInitialRound(state);
  await recovery.persistRound(state, 'intent', 'advancing');
  const pending = queuedMission({ scope, orchestratorId, agentId: 'pending-worker', epoch: 1 });
  const dispatched = queuedMission({ scope, orchestratorId, agentId: 'dispatched-worker', epoch: 1 });
  await insertContinuation({ db, id: 'pending-id', agentId: 'pending-worker', orchestratorId, mission: pending, status: 'pending' });
  await insertContinuation({ db, id: 'dispatched-id', agentId: 'dispatched-worker', orchestratorId, mission: dispatched, status: 'dispatched' });
  const rounds = require('../src/services/agentOrchestrationState').autonomousRounds;
  const roundService = require('../src/services/agentRoundService');
  const originalDispatch = roundService.dispatchPendingContinuation;
  const dispatches = [];
  roundService.dispatchPendingContinuation = id => dispatches.push(id);
  try {
    const restored = await recovery.restoreRound({ db, budgetRound: { stage: 'initial', orchestratorId, ...scope } });
    assert.equal(restored.epoch, 1, 'queued continuation restores the next epoch');
    assert.deepEqual([...restored.workerIds], ['pending-worker', 'dispatched-worker']);
    assert.equal(restored.epochBudget.activeEpoch, 1);
    assert.deepEqual(dispatches, ['pending-worker'], 'already dispatched continuations are never sent twice');
    assert.equal((await require('../src/services/morphogenesis/morphogenesisEpochStore')
      .loadCheckpoint(db, scope)).phase, 'collecting');
  } finally {
    roundService.dispatchPendingContinuation = originalDispatch;
    rounds.delete(orchestratorId);
  }
}

function queuedMission(input) {
  const { scope, orchestratorId, agentId, epoch } = input;
  const allocation = budget.reserveEpoch(budget.createEpochBudget(40, {}, 5), 2);
  return { agentId, budgetRound: { stage: 'morphogenesis_epoch', orchestratorId,
    missionId: scope.missionId, organizationId: scope.organizationId, projectId: scope.projectId, epoch,
    epochBudgetSnapshot: allocation.budget },
  executionBudget: { tokens: 10 } };
}

async function insertContinuation(input) {
  const { db, id, agentId, orchestratorId, mission, status } = input;
  await db.run(`INSERT INTO continuation_queue (id, agent_id, orchestrator_id, mission_json, status)
    VALUES (?, ?, ?, ?, ?)`, id, agentId, orchestratorId, JSON.stringify(mission), status);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
