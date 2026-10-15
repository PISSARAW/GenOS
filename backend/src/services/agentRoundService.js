/**
 * Successive-halving budget rounds: score initial worker evidence, select
 * survivors, and dispatch their continuation missions.
 */
const { selectSurvivors } = require('./tokenAllocationService');
const {
  activeProcesses, missionStarts, pendingContinuations, autonomousRounds,
  activeWorkerBarriers, emit, updateAgent
} = require('./agentOrchestrationState');
const { evidenceScore, extractEvidenceReport } = require('./agentEvidenceService');
const crypto = require('crypto');
const durableContinuation = require('./durableContinuationService');
const trinityAdaptiveBudget = require('./trinityAdaptiveBudgetService');
const continuationQueue = require('./agentContinuationQueueService');
const { createMorphogenesisEpochCoordinator } = require('./morphogenesis/morphogenesisEpochCoordinator');

const MAX_CONTINUATION_DISPATCH_ATTEMPTS = 3;
const FAILED_ROUND_EVENTS = new Set(['AGENT_FAILED', 'AGENT_HALTED', 'AGENT_RUNTIME_ERROR',
  'WORKER_TASK_FAILED', 'WORKER_NO_ANSWER_PROVEN', 'APOPTOSIS_TRIGGERED', 'CELLULAR_APOPTOSIS']);

function autonomousWorkerId(orchestratorId, index) {
  return `worker_${orchestratorId}_${index}_${crypto.randomUUID()}`;
}

function autonomousRoundOutcome(eventType) {
  if (eventType === 'AGENT_COMPLETED') return 'completed';
  if (FAILED_ROUND_EVENTS.has(eventType)) return 'failed';
  return null;
}

function buildRoundResult(mission, outcome, event) {
  return {
    agentId: mission.agentId,
    status: outcome,
    evidenceScore: evidenceScore(event.payload, mission) ?? 0,
    payload: event.payload || {},
    ...transitionResultMetadata(mission, event)
  };
}

function transitionResultMetadata(mission, event) {
  return { ...workerBindingMetadata(mission), ...reportedUsageMetadata(event.payload || {}) };
}

function workerBindingMetadata(mission) {
  return { transitionId: mission.budgetRound?.transitionId || null,
    workerKind: mission.workerKind || null, topology: mission.morphologyTopology || null,
    allocatedTokens: Number(mission.executionBudget?.tokens || 0) };
}

function reportedUsageMetadata(payload) {
  const usage = payload.usage || {};
  return { consumedTokens: Number(usage.tokens ?? payload.tokens ?? 0),
    costUsd: Number(usage.cost_usd ?? payload.cost_usd ?? 0) };
}

function continuationPolicyError(continuation) {
  const survivorCount = Number(continuation?.survivorCount);
  const perWorkerTokens = Number(continuation?.perWorkerTokens);
  if (!Number.isInteger(survivorCount) || !Number.isInteger(perWorkerTokens)) {
    return { eventType: 'TOKEN_ROUND_INVALID', severity: 'error', detail: 'Continuation policy is missing or malformed; no workers were dispatched.' };
  }
  if (survivorCount <= 0 || perWorkerTokens <= 0) {
    return { eventType: 'TOKEN_ROUND_SKIPPED', severity: 'info', detail: 'Continuation round skipped because its budget policy selected no survivors.' };
  }
  return null;
}

function selectRoundSurvivors(completed, continuation, orchestratorId) {
  const arenaTask = require('./arenaTaskEvaluation');
  const paretoResult = arenaTask.evaluateDossiersPareto(completed.map((result) => ({
    workerId: result.agentId,
    evidenceReport: extractEvidenceReport(result.payload) || {},
    fitnessScore: result.evidenceScore,
    tokens: result.payload?.tokens || 1000
  })));
  const preferred = new Set((paretoResult.paretoFront || []).map((candidate) => candidate.candidateId));
  for (const workerId of require('./swarmTopologyRuntimeService').preferredSurvivorsFor(orchestratorId)) preferred.add(workerId);
  const survivors = selectSurvivors(completed, continuation?.survivorCount, preferred);
  return { survivors, paretoResult };
}

async function planAdaptiveContinuation(input) {
  if (input.state.plan.aTeam?.activated) return { adapted: false, reason: 'dedicated_a_team_continuation' };
  try {
    const service = require('./morphogenesis/missionMorphogenesisContinuation');
    return await service.planContinuation(input);
  } catch (error) {
    return { adapted: false, reason: error.code || 'adaptation_failed', error: error.message };
  }
}

function emitMorphogenesisContinuation(orchestratorId, adaptation) {
  if (!adaptation.adapted) {
    emit(orchestratorId, 'MORPHOGENESIS_CONTINUATION_UNCHANGED', 'MORPHOGENESIS',
      `Continuation morphology unchanged: ${adaptation.reason}.`,
      { reason: adaptation.reason, signals: adaptation.signals || null }, 'info');
    return;
  }
  emit(orchestratorId, 'MORPHOGENESIS_CONTINUATION_ADAPTED', 'MORPHOGENESIS',
    `Continuation morphology adapted with ${adaptation.receipt.operator}.`, adaptation.receipt, 'info');
}

function emitRoundEvaluated(context) {
  const { orchestratorId, state, survivors, paretoResult, continuation } = context;
  emit(orchestratorId, 'TOKEN_ROUND_EVALUATED', 'SUCCESSIVE_HALVING', `Initial screening selected ${survivors.length} of ${state.workerIds.size} branches (Pareto Front: ${paretoResult.paretoFrontCount}, Knee-Point: ${paretoResult.kneePoint?.candidateId || 'none'}).`, {
    allocation: state.plan.tokenPolicy.allocation,
    initial: state.plan.tokenPolicy.rounds.initial,
    continuation,
    paretoFrontCount: paretoResult.paretoFrontCount,
    kneePoint: paretoResult.kneePoint?.candidateId || null,
    survivors: survivors.map(({ agentId, evidenceScore: score }) => ({ agentId, evidenceScore: score }))
  }, 'info');
}

function registerRoundResult(mission, event) {
  const round = mission.budgetRound;
  const outcome = autonomousRoundOutcome(event.eventType);
  if (!outcome || !['initial', 'morphogenesis_epoch'].includes(round?.stage)) return null;
  const state = autonomousRounds.get(round.orchestratorId);
  if (!roundMatchesState(round, state)) return null;
  if (!state || state.advanced || !state.workerIds.has(mission.agentId)) return null;
  if (state.results.has(mission.agentId)) return null;
  state.results.set(mission.agentId, buildRoundResult(mission, outcome, event));
  if (state.results.size < state.workerIds.size) return null;
  state.advanced = true;
  return { state, orchestratorId: round.orchestratorId };
}

function roundMatchesState(round, state) {
  if (!state) return false;
  if (round.stage === 'initial') return state.epoch === 0;
  return Number(round.epoch) === state.epoch && state.epoch > 0;
}

function abortRound(orchestratorId, descriptor, payload) {
  emit(orchestratorId, descriptor.eventType, 'SUCCESSIVE_HALVING', descriptor.detail, payload, descriptor.severity);
  autonomousRounds.delete(orchestratorId);
}

function noCompletedWorkerDescriptor() {
  return {
    eventType: 'TOKEN_ROUND_FAILED',
    severity: 'error',
    detail: 'Initial screening produced no completed worker evidence; continuation was not dispatched.'
  };
}

function emitAdaptiveBudgetSkipped(orchestratorId, state, continuation) {
  emit(orchestratorId, 'TRINITY_ADAPTIVE_BUDGET_SKIPPED', 'ADAPTIVE_BUDGET',
    'Adaptive continuation requires three completed worlds, evidence-backed uncertainty, and a minimum tranche for each world.',
    { worldCount: state.workerIds.size, continuationPool: continuation?.pool || 0 }, 'warning');
}

async function advanceTrinityAdaptiveRound(state, orchestratorId) {
  const continuation = state.plan.tokenPolicy.rounds?.continuation;
  const allocation = trinityAdaptiveBudget.allocate({
    workerIds: [...state.workerIds], results: [...state.results.values()],
    pool: Number(continuation?.pool || 0),
    minimumTokens: Number(state.plan.tokenPolicy.minimumWorkerTokens || 1)
  });
  if (!allocation || continuation?.survivorCount !== state.workerIds.size) {
    state.plan.trinity.adaptiveBudgetDecision = {
      status: 'skipped', reason: 'three_completed_worlds_with_verified_uncertainty_and_minimum_tranches_required'
    };
    autonomousRounds.delete(orchestratorId);
    emitAdaptiveBudgetSkipped(orchestratorId, state, continuation);
    return;
  }
  state.plan.trinity.adaptiveBudgetDecision = allocation;
  emit(orchestratorId, 'TRINITY_ADAPTIVE_BUDGET_ALLOCATED', 'ADAPTIVE_BUDGET',
    'The remaining token pool was weighted by each world’s evidence-backed uncertainty; all three worlds continue.',
    { basis: allocation.basis, worlds: allocation.worlds.map(({ worldNumber, uncertainty, evidenceRefs, tokens }) => ({ worldNumber, uncertainty, evidenceRefs, tokens })) }, 'info');
  const continuationPlan = { ...continuation, workerTokens: allocation.worlds.map((world) => world.tokens) };
  let queued;
  try {
    queued = await continuationQueue.queueContinuationMissions(allocation.worlds.map((world, index) => ({
    state, survivor: state.results.get(world.agentId), continuation: continuationPlan, index, orchestratorId
    })));
  } catch (error) {
    state.plan.trinity.adaptiveBudgetDecision = { status: 'blocked', reason: 'continuation_persistence_failed' };
    autonomousRounds.delete(orchestratorId);
    emit(orchestratorId, 'TRINITY_ADAPTIVE_CONTINUATION_PERSIST_FAILED', 'RECOVERY', error.message, {}, 'error');
    return;
  }
  autonomousRounds.delete(orchestratorId);
  for (const workerId of queued) dispatchPendingContinuation(workerId);
}

const adaptNextEpoch = createMorphogenesisEpochCoordinator({
  emit, autonomousRounds, selectRoundSurvivors, emitRoundEvaluated, planAdaptiveContinuation,
  emitMorphogenesisContinuation, queueContinuationMissions: continuationQueue.queueContinuationMissions,
  dispatchPendingContinuation
});

async function advanceAutonomousRound(mission, event) {
  await recordRoundEvent(mission, event);
}

async function recordRoundEvent(mission, event) {
  await restoreRoundIfMissing(mission);
  const roundState = autonomousRounds.get(mission.budgetRound?.orchestratorId);
  if (roundState?.roundPhase === 'advancing') return null;
  const recovery = require('./morphogenesis/morphogenesisEpochRecovery');
  const interrupted = roundState && await recovery.markRecoveryRequired(
    roundState, mission.budgetRound.orchestratorId);
  if (interrupted) return null;
  if (roundState?.roundPhase === 'recovery_required') return null;
  const hadResult = roundState?.results.has(mission.agentId) || false;
  const registered = registerRoundResult(mission, event);
  await persistNewTerminalResult(roundState, mission, hadResult);
  if (registered) return registered;
  if (isResumedBarrier(roundState)) return { state: roundState, orchestratorId: mission.budgetRound.orchestratorId };
  return null;
}

async function restoreRoundIfMissing(mission) {
  const orchestratorId = mission.budgetRound?.orchestratorId;
  if (!autonomousRounds.has(orchestratorId)) {
    await require('./morphogenesis/morphogenesisEpochRecovery').restoreRound(mission);
  }
}

async function persistNewTerminalResult(state, mission, hadResult) {
  if (!state || hadResult || !state.results.has(mission.agentId)) return;
  const recovery = require('./morphogenesis/morphogenesisEpochRecovery');
  const phase = state.advanced ? 'barrier_ready' : 'collecting';
  const key = `result-${mission.budgetRound.stage}-${mission.budgetRound.epoch || 0}-${mission.agentId}`;
  await recovery.persistRound(state, key, phase);
}

function isResumedBarrier(state) {
  return state?.advanced === true && state.roundPhase === 'barrier_ready';
}

async function advanceRegisteredRound(registered) {
  const { state, orchestratorId } = registered;

  if (state.plan.trinity?.activated === true) {
    if (state.plan.trinity.adaptiveBudget === true) return advanceTrinityAdaptiveRound(state, orchestratorId);
    autonomousRounds.delete(orchestratorId);
    emit(
      orchestratorId,
      'TRINITY_ADAPTIVE_CONTINUATION_SUPPRESSED',
      'PRESERVE_TRINITY_WORLDS',
      'Trinity keeps all three sealed worlds; adaptive survivor selection is disabled.',
      { worldCount: state.workerIds.size, continuationPool: state.plan.tokenPolicy.rounds?.continuation?.pool || 0 },
      'info'
    );
    return;
  }

  const continuation = state.plan.tokenPolicy.rounds?.continuation;
  const policyError = continuationPolicyError(continuation);
  if (policyError) return abortRound(orchestratorId, policyError, { continuation });
  const recovery = require('./morphogenesis/morphogenesisEpochRecovery');
  await adaptNextEpoch(state, orchestratorId);
  const status = state.plan.morphogenesisEpochStatus?.status;
  const phase = status === 'resolved' ? 'resolved' : status === 'stopped' ? 'stopped' : 'collecting';
  await recovery.persistRound(state, `transition-${state.epoch}-${phase}`, phase);
}

async function resumeMorphogenesisBarrier(state, orchestratorId) {
  const resolvedId = typeof state === 'string' ? state : orchestratorId || state?.orchestratorId;
  const resolvedState = typeof state === 'string' ? autonomousRounds.get(state) : state || autonomousRounds.get(resolvedId);
  if (!resolvedState || !resolvedId || !isResumedBarrier(resolvedState)) return false;
  if ([...resolvedState.workerIds].some((workerId) => activeProcesses.has(workerId)
    || missionStarts.has(workerId))) return false;
  resolvedState.roundPhase = 'advancing';
  await require('./morphogenesis/morphogenesisEpochRecovery').persistRound(resolvedState,
    `advancing-${resolvedState.epoch}`, 'advancing');
  await advanceRegisteredRound({ state: resolvedState, orchestratorId: resolvedId });
  return true;
}

function handleContinuationFailure(agentId, mission, error) {
  const attempts = Number(mission.continuationDispatchAttempts || 0) + 1;
  emit(mission.orchestratorAgentId || agentId, 'TOKEN_ROUND_DISPATCH_FAILED', 'SUCCESSIVE_HALVING', error.message, { workerId: agentId, attempts }, 'error');
  if (attempts >= MAX_CONTINUATION_DISPATCH_ATTEMPTS) {
    updateAgent(agentId, 'error', error.message).catch(() => {});
    return;
  }
  pendingContinuations.set(agentId, { ...mission, continuationDispatchAttempts: attempts });
  setTimeout(() => dispatchPendingContinuation(agentId), 50 * (2 ** (attempts - 1))).unref();
}

async function resolvePendingContinuation(agentId) {
  const localMission = pendingContinuations.get(agentId);
  if (localMission) return localMission;
  const durable = await durableContinuation.loadContinuation({ agentId }).catch(() => null);
  if (!durable?.mission) return null;
  pendingContinuations.set(agentId, durable.mission);
  return durable.mission;
}

function continuationIsBlocked(agentId, mission) {
  if (!mission) return true;
  return activeProcesses.has(agentId) || missionStarts.has(agentId);
}

function barrierCancelled(mission) {
  return activeWorkerBarriers.get(mission.orchestratorAgentId)?.cancelled;
}

async function dispatchPendingContinuation(agentId) {
  const { startMission } = require('./agentRuntimeAdapter');
  if (activeProcesses.has(agentId) || missionStarts.has(agentId)) return;
  const mission = await resolvePendingContinuation(agentId);
  if (continuationIsBlocked(agentId, mission)) return;
  if (barrierCancelled(mission)) {
    pendingContinuations.delete(agentId);
    return;
  }
  const claimed = await durableContinuation.claimContinuation({ agentId, id: mission.continuationId });
  if (!claimed) {
    pendingContinuations.delete(agentId);
    return;
  }
  pendingContinuations.delete(agentId);
  startMission(mission).then(() => {
    durableContinuation.markContinuation({ agentId, id: mission.continuationId, status: 'dispatched' }).catch(() => {});
  }).catch((error) => handleClaimedContinuationFailure(agentId, mission, error));
}

function handleClaimedContinuationFailure(agentId, mission, error) {
  emit(mission.orchestratorAgentId || agentId, 'TOKEN_ROUND_DISPATCH_AMBIGUOUS', 'RECOVERY',
    'A claimed continuation failed; automatic redispatch is suppressed until reconciliation.',
    { workerId: agentId, continuationId: mission.continuationId, code: error.code || 'START_FAILED' }, 'error');
  durableContinuation.markContinuation({ agentId, id: mission.continuationId,
    status: 'dispatch_failed_ambiguous' }).catch(() => {});
  updateAgent(agentId, 'error', error.message).catch(() => {});
}

module.exports = { MAX_CONTINUATION_DISPATCH_ATTEMPTS, autonomousWorkerId, autonomousRoundOutcome,
  registerRoundResult, advanceAutonomousRound, resumeMorphogenesisBarrier, dispatchPendingContinuation };
