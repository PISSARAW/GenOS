/**
 * Worker evidence barrier: honest terminal states for partial synthesis.
 * Partial barriers end with WORKER_EVIDENCE_BARRIER_PARTIAL only, never
 * with WORKER_EVIDENCE_BARRIER_SATISFIED. Ghost workers degrade to
 * partial when usable dossiers exist. Failure-only dossiers are not
 * usable in partial mode.
 */
const {
  activeWorkerBarriers,
  workerEvidenceRounds,
  emit,
  updateAgent
} = require('./agentOrchestrationState');
const { validateWorkerDossiers } = require('./agentEvidenceService');
const { applyTrinityComparison } = require('./trinityComparativeBarrier');
const { applyAteamIntegration } = require('./aTeamComparativeBarrier');
const { applyCognitiveSynthesis } = require('./cognitiveSynthesisService');
const helpers = require('./workerEvidenceBarrierHelpers');

const {
  applySynthesisPlan, clearBarrier, emitDossiersAttached, emitHaltedOrFailed,
  emitPartialTerminal, emitSatisfiedTerminal, findFaultyWorkers, isUsablePartialDossier,
  loadDossiers, readContract, selectUsablePartialDossiers, setupBarrier,
  stopWorkersQuietly, usableWorkerIdSet, workerIdList
} = helpers;

function resolveTimeoutFlag(error) {
  if (!error) return false;
  if (error.code === 'WORKER_BARRIER_TIMEOUT') return true;
  return false;
}

function resolveCancelledFlag(error) {
  if (!error) return false;
  if (error.code === 'WORKER_BARRIER_CANCELLED') return true;
  return false;
}

async function degradeOrHalt(ctx) {
  const cancelled = resolveCancelledFlag(ctx.error);
  if (cancelled) {
    await stopWorkersQuietly(ctx.workers);
    await updateAgent(ctx.agentId, 'blocked', ctx.error.message);
    emitHaltedOrFailed({ agentId: ctx.agentId, workers: ctx.workers, error: ctx.error, cancelled: true });
    clearBarrier(ctx.agentId);
    throw ctx.error;
  }
  const dossiers = loadDossiers({ agentId: ctx.agentId, workers: ctx.workers });
  const usable = selectUsablePartialDossiers(dossiers);
  if (usable.length === 0) {
    await stopWorkersQuietly(ctx.workers);
    await updateAgent(ctx.agentId, 'error', ctx.error.message);
    emitHaltedOrFailed({ agentId: ctx.agentId, workers: ctx.workers, error: ctx.error, cancelled: false });
    clearBarrier(ctx.agentId);
    throw ctx.error;
  }
  const usableIds = usableWorkerIdSet(usable);
  const faulty = findFaultyWorkers(ctx.workers, usableIds);
  await stopWorkersQuietly(faulty);
  return usable;
}

function noEvidenceError() {
  return Object.assign(new Error('Worker evidence barrier timed out before any usable dossier was collected.'), { code: 'WORKER_BARRIER_NO_EVIDENCE' });
}

function promptBaseOf(normalizedMission) {
  if (normalizedMission.prompt) return normalizedMission.prompt;
  if (normalizedMission.currentTask) return normalizedMission.currentTask;
  return '';
}

async function finalizePartial(ctx) {
  applySynthesisPlan({
    normalizedMission: ctx.normalizedMission,
    autonomyPlan: ctx.autonomyPlan,
    usable: ctx.usable,
    promptBase: promptBaseOf(ctx.normalizedMission)
  });
  emitDossiersAttached({
    agentId: ctx.agentId,
    workers: ctx.workers,
    usable: ctx.usable,
    partial: true,
    detail: 'Persisted and attached partial worker evidence dossiers to synthesis prompt. Reason: ' + (ctx.partialReason || 'unknown')
  });
  emitPartialTerminal({ agentId: ctx.agentId, workers: ctx.workers, usable: ctx.usable, partialReason: ctx.partialReason });
  clearBarrier(ctx.agentId);
}

async function finalizeSatisfied(ctx) {
  applySynthesisPlan({
    normalizedMission: ctx.normalizedMission,
    autonomyPlan: ctx.autonomyPlan,
    usable: ctx.usable,
    promptBase: promptBaseOf(ctx.normalizedMission)
  });
  emitDossiersAttached({
    agentId: ctx.agentId,
    workers: ctx.workers,
    usable: ctx.usable,
    partial: false,
    detail: 'Persisted and attached worker evidence dossiers to synthesis prompt.'
  });
  emitSatisfiedTerminal({ agentId: ctx.agentId, workers: ctx.workers, usable: ctx.usable });
  clearBarrier(ctx.agentId);
}

async function runPipelineStage(ctx) {
  const pipeline = require('./workerEvidenceBarrierPipeline');
  await pipeline.executeWorkerPipeline({
    db: ctx.db,
    orchestratorId: ctx.agentId,
    workers: ctx.workers,
    contract: ctx.contract,
    barrier: ctx.barrier,
    timeoutMs: ctx.timeoutMs
  });
}

function resolveBarrierTimeout(missionTimeoutMs) {
  const scaled = Math.floor(Number(missionTimeoutMs) * 0.35);
  return Math.max(120000, Math.min(600000, scaled));
}

async function runEvidenceBarrier(barrierContext) {
  const workers = barrierContext.autonomousWorkers;
  if (!workers) return;
  if (workers.length === 0) return;
  const detail = 'Waiting for ' + String(workers.length) + ' delegated workers and continuation rounds before starting the official root synthesis.';
  const barrier = await setupBarrier({
    agentId: barrierContext.agentId,
    workers: workers,
    detail: detail
  });
  let partial = false;
  let degradedUsable = null;
  let partialReason = null;
  try {
    await runPipelineStage({
      db: barrierContext.db,
      agentId: barrierContext.agentId,
      workers: workers,
      contract: readContract({ contractRecord: barrierContext.contractRecord }),
      barrier: barrier,
      timeoutMs: barrierContext.normalizedMission.workerBarrierTimeoutMs ??
        (barrierContext.normalizedMission.timeoutMs ? resolveBarrierTimeout(barrierContext.normalizedMission.timeoutMs) : 60000)
    });
  } catch (error) {
    if (resolveTimeoutFlag(error)) {
      partial = true;
      partialReason = 'timeout';
      emit(barrierContext.agentId, 'WORKER_EVIDENCE_BARRIER_TIMEOUT', 'PARTIAL_BARRIER',
        'Worker evidence barrier timed out; proceeding with partial evidence from completed workers.',
        { workerIds: workerIdList(workers), timeoutMs: error.timeoutMs }, 'warning');
    } else {
      degradedUsable = await degradeOrHalt({
        agentId: barrierContext.agentId,
        workers: workers,
        error: error
      });
      partial = true;
      partialReason = 'error';
      emit(barrierContext.agentId, 'WORKER_EVIDENCE_BARRIER_DEGRADED', 'PARTIAL_BARRIER',
        'Worker evidence barrier degraded due to error: ' + error.message + '; proceeding with partial evidence from usable dossiers.',
        { workerIds: workerIdList(workers), errorCode: error.code, errorMessage: error.message }, 'error');
    }
  }
  // Si le mode strict est activé, rejeter les résultats partiels
  if (barrierContext.strict !== false && partial) {
    const dossiers = loadDossiers({ agentId: barrierContext.agentId, workers: workers });
    const usable = selectUsablePartialDossiers(dossiers);
    if (usable.length === 0) {
      await stopWorkersQuietly(workers);
      clearBarrier(barrierContext.agentId);
      throw noEvidenceError();
    }
    // En mode strict, on rejette aussi les résultats partiels même s'il y a des dossiers utilisables
    await stopWorkersQuietly(workers);
    clearBarrier(barrierContext.agentId);
    throw Object.assign(new Error('Worker evidence barrier completed with partial evidence in strict mode.'), { code: 'WORKER_BARRIER_STRICT_PARTIAL' });
  }
  await finishBarrier({
    db: barrierContext.db,
    agentId: barrierContext.agentId,
    normalizedMission: barrierContext.normalizedMission,
    autonomyPlan: barrierContext.autonomyPlan,
    contractRecord: barrierContext.contractRecord,
    workers: workers,
    partial: partial,
    degradedUsable: degradedUsable,
    partialReason: partialReason
  });
}

async function finishBarrier(ctx) {
  if (ctx.partial) {
    await finishPartialBarrier(ctx);
    return;
  }
  await finishSatisfiedBarrier(ctx);
}

async function finishPartialBarrier(ctx) {
  let usable = ctx.degradedUsable;
  if (!usable) {
    const dossiers = loadDossiers({ agentId: ctx.agentId, workers: ctx.workers });
    usable = selectUsablePartialDossiers(dossiers);
  }
  if (usable.length === 0) {
    await stopWorkersQuietly(ctx.workers);
    clearBarrier(ctx.agentId);
    throw noEvidenceError();
  }
  await applyTrinityComparison({ db: ctx.db, agentId: ctx.agentId, workers: ctx.workers, autonomyPlan: ctx.autonomyPlan, usable }).catch(() => {});
  await applyAteamIntegration({ db: ctx.db, agentId: ctx.agentId, workers: ctx.workers, autonomyPlan: ctx.autonomyPlan, usable }).catch(() => {});
  await applyCognitiveSynthesis({ agentId: ctx.agentId, workers: ctx.workers, autonomyPlan: ctx.autonomyPlan, usable }).catch(() => {});
  await finalizePartial({
    agentId: ctx.agentId,
    workers: ctx.workers,
    usable: usable,
    normalizedMission: ctx.normalizedMission,
    autonomyPlan: ctx.autonomyPlan,
    partialReason: ctx.partialReason
  });
}

async function attachCounterfactualScores(ctx, dossiers) {
  try {
    const rollout = require('./counterfactualRolloutService');
    const scored = await rollout.scoreBranches({
      db: ctx.db,
      orchestratorId: ctx.agentId,
      rolloutId: ctx.autonomyPlan?.trinity?.missionId || null,
      workers: ctx.workers || [],
      dossiers
    });
    if (ctx.autonomyPlan && ctx.autonomyPlan.trinity) ctx.autonomyPlan.trinity.counterfactual = scored;
  } catch (_) {}
}

async function attachProbeVerdicts(ctx, dossiers) {
  try {
    const probes = require('./attentionProbeService');
    const verdicts = await probes.verifyProbesForDossiers(ctx.db, dossiers);
    if (ctx.autonomyPlan && Object.keys(verdicts).length) ctx.autonomyPlan.attentionProbes = verdicts;
  } catch (_) {}
}

async function finishSatisfiedBarrier(ctx) {
  const dossiers = loadDossiers({ agentId: ctx.agentId, workers: ctx.workers });
  validateWorkerDossiers(dossiers, ctx.workers, { contract: readContract({ contractRecord: ctx.contractRecord }) });
  await applyTrinityComparison({ db: ctx.db, agentId: ctx.agentId, workers: ctx.workers, autonomyPlan: ctx.autonomyPlan, usable: dossiers }).catch(() => {});
  await attachCounterfactualScores(ctx, dossiers);
  await attachProbeVerdicts(ctx, dossiers);
  await applyAteamIntegration({ db: ctx.db, agentId: ctx.agentId, workers: ctx.workers, autonomyPlan: ctx.autonomyPlan, usable: dossiers }).catch(() => {});
  await applyCognitiveSynthesis({ agentId: ctx.agentId, workers: ctx.workers, autonomyPlan: ctx.autonomyPlan, usable: dossiers }).catch(() => {});
  await finalizeSatisfied({
    agentId: ctx.agentId,
    workers: ctx.workers,
    usable: dossiers,
    normalizedMission: ctx.normalizedMission,
    autonomyPlan: ctx.autonomyPlan
  });
}

module.exports = {
  isUsablePartialDossier,
  selectUsablePartialDossiers,
  runEvidenceBarrier,
  resolveTimeoutFlag,
  resolveCancelledFlag
};
