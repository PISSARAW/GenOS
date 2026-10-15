'use strict';

const { performance } = require('node:perf_hooks');
const { getDatabase } = require('../../db');
const store = require('./morphogenesisEpochStore');

const MAX_CHECKPOINT_RETRIES = 3;
const STARTUP_RECOVERY_LIMIT = 32;

async function registerInitialRound(state) {
  state.checkpointRevision = 0;
  state.roundPhase = 'collecting';
  await persistRound(state, 'initial-registration');
}

async function restoreRound(mission) {
  const round = mission.budgetRound;
  if (!round || round.stage === 'trinity') return null;
  const scope = checkpointScope(round);
  if (!scope) return null;
  const db = mission.db || await getDatabase();
  const checkpoint = await store.loadCheckpoint(db, scope);
  if (!checkpoint || isTerminalPhase(checkpoint.phase)) return null;
  const state = deserializeState(checkpoint.state, db, checkpoint);
  if (checkpoint.phase === 'advancing') {
    await recoverAdvancingPhase(state, round.orchestratorId);
    require('../agentOrchestrationState').autonomousRounds.set(round.orchestratorId, state);
    await dispatchRestoredPending(state);
    return state;
  }
  if (roundMatchesState(round, state)) return require('../agentOrchestrationState').autonomousRounds.set(round.orchestratorId, state), state;
  return null;
}

async function recoverAdvancingPhase(state, orchestratorId) {
  const epoch = state.epoch + 1;
  const continuationStore = require('../durableContinuationService');
  const queued = await continuationStore.loadCohortContinuations({ db: state.db, orchestratorId,
    missionId: state.checkpointScope.missionId, epoch });
  if (queued.length) return adoptQueuedContinuations({ state, queued, epoch, orchestratorId });
  await markRecoveryRequired(state, orchestratorId);
}

async function adoptQueuedContinuations(input) {
  const { state, queued, epoch, orchestratorId } = input;
  const snapshots = queued.map((item) => item.mission.budgetRound?.epochBudgetSnapshot);
  const snapshot = snapshots[0];
  if (!snapshot || snapshots.some((item) => JSON.stringify(item) !== JSON.stringify(snapshot))) {
    return markRecoveryRequired(state, orchestratorId);
  }
  state.epochBudget = snapshot;
  state.epoch = epoch;
  state.workerIds = new Set(queued.map(item => item.agentId));
  state.workers = new Map([...state.workers, ...queued.map(item => [item.agentId, item.mission])]);
  state.results = new Map();
  state.advanced = false;
  state.roundPhase = 'collecting';
  state.plan.morphogenesisEpochStatus = { status: 'running', epoch, budget: state.epochBudget,
    recoveredFromContinuationQueue: true };
  await persistRound(state, `recovered-queued-epoch-${epoch}`, 'collecting');
  if (hasAmbiguousDispatch(queued)) {
    state.roundPhase = 'advancing';
    await markRecoveryRequired(state, orchestratorId, 'interrupted_during_dispatch_requires_reconciliation', true);
    return;
  }
  state.pendingRecoveryDispatch = queued.filter((item) => item.status === 'pending').map((item) => item.agentId);
}

function hasAmbiguousDispatch(queued) {
  return queued.some((item) => ['dispatching', 'dispatch_failed_ambiguous'].includes(item.status));
}

async function dispatchRestoredPending(state) {
  const pending = state.pendingRecoveryDispatch || [];
  delete state.pendingRecoveryDispatch;
  for (const agentId of pending) await require('../agentRoundService').dispatchPendingContinuation(agentId);
}

async function recoverStartupCheckpoints(db, input = {}) {
  const startedAt = performance.now();
  const storeResult = await store.listCheckpoints(db, { phases: ['advancing', 'collecting'],
    includeContinuationEpochs: true, limit: input.limit || STARTUP_RECOVERY_LIMIT });
  const summary = { inspected: storeResult.checkpoints.length, restored: 0, actionable: 0,
    trinityExcluded: 0, failed: 0, truncated: storeResult.truncated };
  for (const checkpoint of storeResult.checkpoints) recordStartupOutcome(summary,
    await startupCheckpointOutcome(db, checkpoint));
  summary.durationMs = Math.max(0, performance.now() - startedAt);
  return summary;
}

async function startupCheckpointOutcome(db, checkpoint) {
  if (checkpoint.state?.plan?.trinity?.activated === true) return { status: 'trinityExcluded' };
  try {
    const restored = await restoreCheckpointForStartup(db, checkpoint);
    return { status: startupRestoreStatus(restored) };
  } catch (error) {
    return { status: 'failed', failure: { missionId: checkpoint.missionId, code: error.code || 'RECOVERY_FAILED' } };
  }
}

async function restoreCheckpointForStartup(db, checkpoint) {
  const state = checkpoint.state || {};
  const stage = checkpoint.epoch === 0 ? 'initial' : 'morphogenesis_epoch';
  const restored = await restoreRound({ db, budgetRound: { stage,
    orchestratorId: state.orchestratorId || checkpoint.missionId, missionId: checkpoint.missionId,
    organizationId: checkpoint.organizationId, projectId: checkpoint.projectId, epoch: checkpoint.epoch } });
  if (restored && checkpoint.phase === 'collecting') await dispatchPendingForCollectedEpoch(restored);
  return restored;
}

function startupRestoreStatus(state) {
  if (!state) return 'failed';
  return state.roundPhase === 'recovery_required' ? 'actionable' : 'restored';
}

async function dispatchPendingForCollectedEpoch(state) {
  if (state.epoch < 1) return;
  const queued = await require('../durableContinuationService').loadCohortContinuations({
    db: state.db, orchestratorId: state.orchestratorId, missionId: state.checkpointScope.missionId, epoch: state.epoch
  });
  if (hasAmbiguousDispatch(queued)) {
    await markRecoveryRequired(state, state.orchestratorId,
      'interrupted_during_dispatch_requires_reconciliation', true);
    return;
  }
  const roundService = require('../agentRoundService');
  for (const item of queued) {
    if (item.status === 'pending' && state.workerIds.has(item.agentId)) {
      await roundService.dispatchPendingContinuation(item.agentId);
    }
  }
}

function recordStartupOutcome(summary, outcome) {
  summary[outcome.status] += 1;
  if (!outcome.failure) return;
  summary.failures ||= [];
  summary.failures.push(outcome.failure);
}

async function markRecoveryRequired(state, orchestratorId,
  reason = 'interrupted_during_advancement_requires_operator_resume', allowCollecting = false) {
  if (state.roundPhase !== 'advancing' && !(allowCollecting && state.roundPhase === 'collecting')) return false;
  state.plan.morphogenesisEpochStatus = { status: 'recovery_required', reason, epoch: state.epoch,
    budget: state.epochBudget, checkpointRevision: state.checkpointRevision };
  state.roundPhase = 'recovery_required';
  require('../agentOrchestrationState').emit(orchestratorId, 'MORPHOGENESIS_RECOVERY_REQUIRED', 'RECOVERY',
    'Epoch transition interrupted after intent checkpoint; automatic replay was suppressed to prevent duplicate dispatch.',
    { reason, epoch: state.epoch, checkpointRevision: state.checkpointRevision }, 'warning');
  await persistRound(state, `recovery-required-${state.checkpointRevision}`, 'recovery_required');
  return true;
}

async function requestOperatorResume(db, scope) {
  const checkpoint = await store.loadCheckpoint(db, scope);
  if (!checkpoint || checkpoint.phase !== 'recovery_required') {
    throw Object.assign(new Error('Morphogenesis checkpoint is not awaiting operator resume.'), {
      code: 'MORPHOGENESIS_RESUME_NOT_REQUIRED'
    });
  }
  const state = { ...checkpoint.state, advanced: true,
    plan: { ...checkpoint.state.plan, morphogenesisEpochStatus: { status: 'resume_requested', epoch: checkpoint.epoch } } };
  const saved = await store.saveCheckpoint(db, { ...scope, epoch: checkpoint.epoch, phase: 'barrier_ready',
    expectedRevision: checkpoint.revision, idempotencyKey: `${scope.missionId}:operator-resume-${checkpoint.revision}`,
    state, results: checkpoint.results, budget: checkpoint.budget, barrier: checkpoint.barrier });
  const restored = deserializeState(saved.state, db, saved);
  restored.advanced = true;
  restored.roundPhase = 'barrier_ready';
  const orchestratorId = saved.state.orchestratorId || saved.missionId;
  require('../agentOrchestrationState').autonomousRounds.set(orchestratorId, restored);
  await require('../agentRoundService').resumeMorphogenesisBarrier(restored, orchestratorId);
  return store.loadCheckpoint(db, scope);
}

async function persistRound(state, key, phase = state.roundPhase) {
  state.roundPhase = phase;
  const scope = state.checkpointScope;
  if (!scope || !state.db) return null;
  const recoveryState = serializeState(state);
  for (let attempt = 0; attempt < MAX_CHECKPOINT_RETRIES; attempt += 1) {
    try {
      const checkpoint = await store.saveCheckpoint(state.db, {
        ...scope, epoch: state.epoch, phase, expectedRevision: state.checkpointRevision,
        idempotencyKey: `${scope.missionId}:${key}`, state: recoveryState,
        results: recoveryState.results, budget: state.epochBudget, barrier: barrierSnapshot(state)
      });
      state.checkpointRevision = checkpoint.revision;
      state.roundPhase = phase;
      return checkpoint;
    } catch (error) {
      if (error.code !== 'MORPHOGENESIS_CHECKPOINT_REVISION_CONFLICT' || attempt + 1 === MAX_CHECKPOINT_RETRIES) throw error;
      const current = await store.loadCheckpoint(state.db, scope);
      state.checkpointRevision = current?.revision || 0;
    }
  }
  return null;
}

function checkpointScope(round) {
  const missionId = round.missionId || round.orchestratorId;
  if (typeof missionId !== 'string' || !missionId) return null;
  return { missionId, organizationId: round.organizationId || null, projectId: round.projectId || null };
}

function serializeState(state) {
  return { orchestratorId: state.orchestratorId, plan: state.plan, normalizedMission: state.normalizedMission,
    workers: [...state.workers], workerIds: [...state.workerIds], results: [...state.results],
    epoch: state.epoch, epochBudget: state.epochBudget, advanced: state.advanced,
    morphogenesisCohorts: state.morphogenesisCohorts || [], currentCohortId: state.currentCohortId || null,
    organizationId: state.organizationId || null, projectId: state.projectId || null };
}

function deserializeState(saved, db, checkpoint) {
  return { ...saved, db, checkpointScope: { missionId: checkpoint.missionId,
    organizationId: checkpoint.organizationId, projectId: checkpoint.projectId },
  checkpointRevision: checkpoint.revision, roundPhase: checkpoint.phase,
  workers: new Map(saved.workers), workerIds: new Set(saved.workerIds), results: new Map(saved.results) };
}

function barrierSnapshot(state) {
  return { status: state.advanced ? 'quiescent' : 'collecting', expected: state.workerIds.size,
    observed: state.results.size, workerIds: [...state.workerIds] };
}

function roundMatchesState(round, state) {
  if (round.stage === 'initial') return state.epoch === 0;
  return Number(round.epoch) === state.epoch && state.epoch > 0;
}

function isTerminalPhase(phase) {
  return ['resolved', 'stopped'].includes(phase);
}

module.exports = { registerInitialRound, restoreRound, markRecoveryRequired, requestOperatorResume,
  persistRound, serializeState, recoverStartupCheckpoints, STARTUP_RECOVERY_LIMIT };
