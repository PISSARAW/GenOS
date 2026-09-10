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

function selectRoundSurvivors(completed, continuation) {
  const arenaTask = require('./arenaTaskEvaluation');
  const paretoResult = arenaTask.evaluateDossiersPareto(completed.map((result) => ({
    workerId: result.agentId,
    evidenceReport: extractEvidenceReport(result.payload) || {},
    fitnessScore: result.evidenceScore,
    tokens: result.payload?.tokens || 1000
  })));
  const paretoAgentIds = new Set((paretoResult.paretoFront || []).map((candidate) => candidate.candidateId));
  const survivors = selectSurvivors(completed, continuation?.survivorCount, paretoAgentIds);
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
  pendingContinuations.set(survivor.agentId, {
    ...previous,
    prompt: `${previous.prompt}\n\nBudget round: continuation. You were selected after evidence scoring. Use the remaining ${assignedTokens} tokens only to resolve the highest-value uncertainty and return a final evidence report. Initial dossier:\n${dossier}`,
    executionBudget: {
      ...previous.executionBudget,
      tokens: assignedTokens,
      events: Math.max(1, budget.events - consumed.events),
      costUsd: Math.max(0, budget.costUsd - consumed.cost)
    },
    budgetRound: { stage: 'continuation', orchestratorId }
  });
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

async function advanceAutonomousRound(mission, event) {
  const registered = registerInitialResult(mission, event);
  if (!registered) return;
  const { state, orchestratorId } = registered;

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

  const { survivors, paretoResult } = selectRoundSurvivors(completed, continuation);
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

function dispatchPendingContinuation(agentId) {
  const { startMission } = require('./agentRuntimeAdapter');
  if (activeProcesses.has(agentId) || missionStarts.has(agentId)) return;
  const mission = pendingContinuations.get(agentId);
  if (!mission) return;
  if (activeWorkerBarriers.get(mission.orchestratorAgentId)?.cancelled) {
    pendingContinuations.delete(agentId);
    return;
  }
  pendingContinuations.delete(agentId);
  startMission(mission).catch((error) => handleContinuationFailure(agentId, mission, error));
}

module.exports = { MAX_CONTINUATION_DISPATCH_ATTEMPTS, autonomousWorkerId, autonomousRoundOutcome, advanceAutonomousRound, dispatchPendingContinuation };
