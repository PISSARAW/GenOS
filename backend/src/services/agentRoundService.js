/**
 * Successive-halving budget rounds: score initial worker evidence, select
 * survivors, and dispatch their continuation missions.
 */
const { selectSurvivors } = require('./tokenAllocationService');
const {
  activeProcesses, missionStarts, pendingContinuations, autonomousRounds,
  activeWorkerBarriers, emit
} = require('./agentOrchestrationState');
const { evidenceScore } = require('./agentEvidenceService');

const MAX_CONTINUATION_DISPATCH_ATTEMPTS = 3;

function autonomousWorkerId(orchestratorId, index) {
  return `worker_${orchestratorId}_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`;
}
function autonomousRoundOutcome(eventType) {
  if (eventType === 'AGENT_COMPLETED') return 'completed';
  if (['AGENT_FAILED', 'AGENT_HALTED', 'AGENT_RUNTIME_ERROR', 'WORKER_TASK_FAILED', 'WORKER_NO_ANSWER_PROVEN'].includes(eventType)) return 'failed';
  return null;
}
async function advanceAutonomousRound(mission, event) {
  const round = mission.budgetRound;
  const outcome = autonomousRoundOutcome(event.eventType);
  if (round?.stage !== 'initial' || !outcome) return;
  const state = autonomousRounds.get(round.orchestratorId);
  if (!state || state.advanced || !state.workerIds.has(mission.agentId)) return;
  state.results.set(mission.agentId, {
    agentId: mission.agentId,
    status: outcome,
    evidenceScore: evidenceScore(event.payload, mission),
    payload: event.payload || {}
  });
  if (state.results.size < state.workerIds.size) return;
  state.advanced = true;
  const continuation = state.plan.tokenPolicy.rounds?.continuation;
  if (!continuation || !Number.isInteger(Number(continuation.survivorCount)) || !Number.isInteger(Number(continuation.perWorkerTokens))) {
    emit(round.orchestratorId, 'TOKEN_ROUND_INVALID', 'SUCCESSIVE_HALVING', 'Continuation policy is missing or malformed; no workers were dispatched.', { continuation }, 'error');
    autonomousRounds.delete(round.orchestratorId);
    return;
  }
  if (continuation.survivorCount <= 0 || continuation.perWorkerTokens <= 0) {
    emit(round.orchestratorId, 'TOKEN_ROUND_SKIPPED', 'SUCCESSIVE_HALVING', 'Continuation round skipped because its budget policy selected no survivors.', { continuation }, 'info');
    autonomousRounds.delete(round.orchestratorId);
    return;
  }
  const completed = [...state.results.values()].filter((result) => result.status === 'completed');
  const arenaTask = require('./arenaTaskEvaluation');
  const paretoResult = arenaTask.evaluateDossiersPareto(completed.map(r => ({
    workerId: r.agentId,
    evidenceReport: r.payload?.evidenceReport || {},
    fitnessScore: r.evidenceScore,
    tokens: r.payload?.tokens || 1000
  })));
  const survivors = selectSurvivors(completed, continuation?.survivorCount);
  emit(round.orchestratorId, 'TOKEN_ROUND_EVALUATED', 'SUCCESSIVE_HALVING', `Initial screening selected ${survivors.length} of ${state.workerIds.size} branches (Pareto Front: ${paretoResult.paretoFrontCount}, Knee-Point: ${paretoResult.kneePoint?.candidateId || 'none'}).`, {
    allocation: state.plan.tokenPolicy.allocation,
    initial: state.plan.tokenPolicy.rounds.initial,
    continuation,
    paretoFrontCount: paretoResult.paretoFrontCount,
    kneePoint: paretoResult.kneePoint?.candidateId || null,
    survivors: survivors.map(({ agentId, evidenceScore: score }) => ({ agentId, evidenceScore: score }))
  }, 'info');
  const continuationWorkerIds = [];
  for (const survivor of survivors) {
    const previous = state.workers.get(survivor.agentId);
    const dossier = JSON.stringify(survivor.payload.evidenceReport || {}).slice(0, 8000);
    pendingContinuations.set(survivor.agentId, {
      ...previous,
      prompt: `${previous.prompt}\n\nBudget round: continuation. You were selected after evidence scoring. Use the remaining ${continuation.perWorkerTokens} tokens only to resolve the highest-value uncertainty and return a final evidence report. Initial dossier:\n${dossier}`,
      executionBudget: { ...previous.executionBudget, tokens: continuation.perWorkerTokens },
      budgetRound: { stage: 'continuation', orchestratorId: round.orchestratorId }
    });
    continuationWorkerIds.push(survivor.agentId);
  }
  autonomousRounds.delete(round.orchestratorId);
  // A survivor may have closed before the final initial worker selected the
  // continuation set. Dispatch every now-idle survivor here; the worker that
  // is still closing will be picked up by its close handler below.
  for (const workerId of continuationWorkerIds) dispatchPendingContinuation(workerId);
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
  startMission(mission).catch((error) => {
    const attempts = Number(mission.continuationDispatchAttempts || 0) + 1;
    emit(mission.orchestratorAgentId || agentId, 'TOKEN_ROUND_DISPATCH_FAILED', 'SUCCESSIVE_HALVING', error.message, { workerId: agentId, attempts }, 'error');
    if (attempts >= MAX_CONTINUATION_DISPATCH_ATTEMPTS) return;
    pendingContinuations.set(agentId, { ...mission, continuationDispatchAttempts: attempts });
    setTimeout(() => dispatchPendingContinuation(agentId), 50 * (2 ** (attempts - 1))).unref();
  });
}

module.exports = { MAX_CONTINUATION_DISPATCH_ATTEMPTS, autonomousWorkerId, autonomousRoundOutcome, advanceAutonomousRound, dispatchPendingContinuation };
