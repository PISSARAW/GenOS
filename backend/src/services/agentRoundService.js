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
const { buildContinuationContext } = require('../../bin/agent-runtime-prompt.cjs');
const durableContinuation = require('./durableContinuationService');
const trinityAdaptiveBudget = require('./trinityAdaptiveBudgetService');

const MAX_CONTINUATION_DISPATCH_ATTEMPTS = 3;

function autonomousWorkerId(orchestratorId, index) {
  return `worker_${orchestratorId}_${index}_${crypto.randomUUID()}`;
}

function autonomousRoundOutcome(eventType) {
  if (eventType === 'AGENT_COMPLETED') return 'completed';
  if (['AGENT_FAILED', 'AGENT_HALTED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED', 'WORKER_NO_ANSWER_PROVEN', 'APOPTOSIS_TRIGGERED', 'CELLULAR_APOPTOSIS'].includes(eventType)) return 'failed';
  return null;
}

function buildRoundResult(mission, outcome, event) {
  return {
    agentId: mission.agentId,
    status: outcome,
    evidenceScore: evidenceScore(event.payload, mission) ?? 0,
    payload: event.payload || {}
  };
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

function continuationTokens(continuation, index) {
  const scheduled = continuation.workerTokens;
  if (Array.isArray(scheduled) && scheduled[index] !== undefined) return scheduled[index];
  return continuation.perWorkerTokens;
}

function consumedFromPayload(payload = {}) {
  const usage = payload.usage || {};
  return {
    events: Number(usage.events ?? payload.events ?? 1),
    cost: Number(usage.cost_usd ?? payload.cost_usd ?? 0)
  };
}

function budgetFromPrevious(previous = {}) {
  const budget = previous.executionBudget || {};
  return { events: Number(budget.events ?? 100), costUsd: Number(budget.costUsd ?? 1) };
}

function queueContinuationMission(context) {
  const { state, survivor, continuation, index, orchestratorId } = context;
  const previous = state.workers.get(survivor.agentId);
  const assignedTokens = continuationTokens(continuation, index);
  const report = extractEvidenceReport(survivor.payload) || {};
  const dossier = JSON.stringify(report).slice(0, 8000);
  const consumed = consumedFromPayload(survivor.payload);
  const budget = budgetFromPrevious(previous);
  const continuationId = `cont_${crypto.randomUUID()}`;
  const diffPrompt = buildContinuationContext(previous, report, assignedTokens);
  const mission = {
    ...previous,
    continuationId,
    prompt: diffPrompt,
    executionBudget: {
      ...previous.executionBudget,
      tokens: assignedTokens,
      events: Math.max(1, budget.events - consumed.events),
      costUsd: Math.max(0, budget.costUsd - consumed.cost)
    },
    budgetRound: { stage: 'continuation', orchestratorId }
  };
  pendingContinuations.set(survivor.agentId, mission);
  durableContinuation.persistContinuation({
    id: continuationId,
    agentId: survivor.agentId,
    orchestratorId,
    mission,
    organizationId: state.organizationId,
    projectId: state.projectId,
  }).catch((error) => emit(orchestratorId, 'CONTINUATION_PERSIST_FAILED', 'RECOVERY', error.message, {}, 'warning'));
  return survivor.agentId;
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

function registerInitialResult(mission, event) {
  const round = mission.budgetRound;
  const outcome = autonomousRoundOutcome(event.eventType);
  if (round?.stage !== 'initial' || !outcome) return null;
  const state = autonomousRounds.get(round.orchestratorId);
  if (!state || state.advanced || !state.workerIds.has(mission.agentId)) return null;
  state.results.set(mission.agentId, buildRoundResult(mission, outcome, event));
  if (state.results.size < state.workerIds.size) return null;
  state.advanced = true;
  return { state, orchestratorId: round.orchestratorId };
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

function advanceTrinityAdaptiveRound(state, orchestratorId) {
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
  const queued = allocation.worlds.map((world, index) => queueContinuationMission({
    state, survivor: state.results.get(world.agentId), continuation: continuationPlan, index, orchestratorId
  }));
  autonomousRounds.delete(orchestratorId);
  for (const workerId of queued) dispatchPendingContinuation(workerId);
}

async function advanceAutonomousRound(mission, event) {
  const registered = registerInitialResult(mission, event);
  if (!registered) return;
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

  const completed = [...state.results.values()].filter((result) => result.status === 'completed');
  if (!completed.length) {
    return abortRound(orchestratorId, noCompletedWorkerDescriptor(), {
      workerCount: state.workerIds.size,
      failedWorkerCount: state.results.size
    });
  }

  const { survivors, paretoResult } = selectRoundSurvivors(completed, continuation, orchestratorId);
  emitRoundEvaluated({ orchestratorId, state, survivors, paretoResult, continuation });
  const continuationWorkerIds = survivors.map((survivor, index) => queueContinuationMission({
    state, survivor, continuation, index, orchestratorId
  }));
  autonomousRounds.delete(orchestratorId);
  // A survivor may have closed before the final initial worker selected the
  // continuation set. Dispatch every now-idle survivor here; the worker that
  // is still closing will be picked up by its close handler below.
  for (const workerId of continuationWorkerIds) dispatchPendingContinuation(workerId);
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
  pendingContinuations.delete(agentId);
  startMission(mission).then(() => {
    durableContinuation.markContinuation({ agentId, id: mission.continuationId, status: 'dispatched' }).catch(() => {});
  }).catch((error) => handleContinuationFailure(agentId, mission, error));
}

module.exports = { MAX_CONTINUATION_DISPATCH_ATTEMPTS, autonomousWorkerId, autonomousRoundOutcome, advanceAutonomousRound, dispatchPendingContinuation };
