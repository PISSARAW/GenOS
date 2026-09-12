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
const {
  workerEvidenceDossiers,
  validateWorkerDossiers,
  buildWorkerSynthesisPrompt
} = require('./agentEvidenceService');

function isUsablePartialEvent(event) {
  if (!event) return false;
  if (event.evidenceReport) return true;
  if (event.noAnswerProof) return true;
  return false;
}

function hasUsablePartialEvent(events) {
  if (Array.isArray(events) === false) return false;
  for (const event of events) {
    if (isUsablePartialEvent(event)) return true;
  }
  return false;
}

function isUsablePartialDossier(dossier) {
  if (!dossier) return false;
  return hasUsablePartialEvent(dossier.events);
}

function selectUsablePartialDossiers(dossiers) {
  if (Array.isArray(dossiers) === false) return [];
  return dossiers.filter(isUsablePartialDossier);
}

function usableWorkerIdSet(usableDossiers) {
  const ids = new Set();
  for (const dossier of usableDossiers) {
    ids.add(dossier.workerId);
  }
  return ids;
}

function findFaultyWorkers(workers, usableIds) {
  const faulty = [];
  for (const worker of workers) {
    if (usableIds.has(worker.agentId)) continue;
    faulty.push(worker);
  }
  return faulty;
}

function workerIdList(workers) {
  return workers.map((worker) => worker.agentId);
}

function partialDetailText(completed, total) {
  return String(completed) + '/' + String(total) + ' workers terminal; continuing with partial evidence.';
}

function clearBarrier(agentId) {
  activeWorkerBarriers.delete(agentId);
  workerEvidenceRounds.delete(agentId);
}

function emitStarted(ctx) {
  emit(ctx.agentId, 'WORKER_EVIDENCE_BARRIER_STARTED', 'WAIT_FOR_WORKERS', ctx.detail, {
    workerIds: workerIdList(ctx.workers)
  }, 'info', 'running');
}

function emitPartialTerminal(ctx) {
  const total = ctx.workers.length;
  const completed = ctx.usable.length;
  emit(ctx.agentId, 'WORKER_EVIDENCE_BARRIER_PARTIAL', 'SYNTHESIZE_PARTIAL', partialDetailText(completed, total), {
    workerIds: workerIdList(ctx.workers),
    workersCompleted: completed,
    workersTotal: total,
    dossierCount: completed,
    partial: true
  }, 'warning', 'running');
}

function emitSatisfiedTerminal(ctx) {
  let evidenceCount = 0;
  for (const dossier of ctx.usable) {
    evidenceCount = evidenceCount + dossier.events.length;
  }
  emit(ctx.agentId, 'WORKER_EVIDENCE_BARRIER_SATISFIED', 'SYNTHESIZE', 'Every delegated worker is terminal and all collected dossiers were attached to the official root synthesis.', {
    workerIds: workerIdList(ctx.workers),
    dossierCount: ctx.usable.length,
    partial: false,
    evidenceEventCount: evidenceCount
  }, 'info', 'running');
}

function emitDossiersAttached(ctx) {
  emit(ctx.agentId, 'WORKER_EVIDENCE_DOSSIERS_ATTACHED', 'ATTACH_DOSSIERS', ctx.detail, {
    workerIds: workerIdList(ctx.workers),
    dossierCount: ctx.usable.length,
    partial: ctx.partial,
    dossiers: ctx.usable
  }, 'info', 'running');
}

function emitHaltedOrFailed(ctx) {
  let eventType = 'WORKER_EVIDENCE_BARRIER_FAILED';
  let action = 'WAIT_FOR_WORKERS';
  let severity = 'error';
  let status = 'error';
  if (ctx.cancelled) {
    eventType = 'WORKER_EVIDENCE_BARRIER_HALTED';
    action = 'STOP';
    severity = 'warning';
    status = 'blocked';
  }
  emit(ctx.agentId, eventType, action, ctx.error.message, {
    workerIds: workerIdList(ctx.workers)
  }, severity, status);
}

function stripDelegationTools(lease) {
  const kept = [];
  if (Array.isArray(lease) === false) return kept;
  for (const tool of lease) {
    if (tool === 'genos_delegate_worker') continue;
    if (tool === 'genos_trinity_launch') continue;
    kept.push(tool);
  }
  return kept;
}

function applySynthesisPlan(ctx) {
  ctx.normalizedMission.prompt = buildWorkerSynthesisPrompt(ctx.promptBase, ctx.usable);
  ctx.normalizedMission.toolLease = stripDelegationTools(ctx.normalizedMission.toolLease);
  ctx.autonomyPlan.synthesisOnly = true;
  ctx.autonomyPlan.dispatchWorkers = [];
  const usableIds = usableWorkerIdSet(ctx.usable);
  const completed = [];
  for (const dossier of ctx.usable) {
    completed.push(dossier.workerId);
  }
  ctx.autonomyPlan.completedWorkerIds = completed;
  ctx.autonomyPlan.mandatoryTools = stripDelegationTools(ctx.autonomyPlan.mandatoryTools);
  void usableIds;
}

function loadDossiers(ctx) {
  return workerEvidenceDossiers(ctx.agentId, ctx.workers);
}

function readContract(ctx) {
  if (!ctx.contractRecord) return undefined;
  return ctx.contractRecord.contract;
}

async function stopWorkersQuietly(workers) {
  const adapter = require('./agentRuntimeAdapter');
  const faulty = workers.slice();
  await Promise.allSettled(faulty.map((worker) => adapter.stopMission(worker.agentId)));
}

async function setupBarrier(ctx) {
  const barrier = {
    cancelled: false,
    workerIds: new Set(workerIdList(ctx.workers))
  };
  activeWorkerBarriers.set(ctx.agentId, barrier);
  workerEvidenceRounds.set(ctx.agentId, {
    workerIds: new Set(workerIdList(ctx.workers)),
    participants: new Map(),
    events: new Map()
  });
  await updateAgent(ctx.agentId, 'running', 'Waiting for delegated evidence before final synthesis');
  emitStarted({ agentId: ctx.agentId, workers: ctx.workers, detail: ctx.detail });
  return barrier;
}

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
    detail: 'Persisted and attached partial worker evidence dossiers to synthesis prompt.'
  });
  emitPartialTerminal({ agentId: ctx.agentId, workers: ctx.workers, usable: ctx.usable });
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
  try {
    await runPipelineStage({
      db: barrierContext.db,
      agentId: barrierContext.agentId,
      workers: workers,
      contract: readContract({ contractRecord: barrierContext.contractRecord }),
      barrier: barrier,
      timeoutMs: barrierContext.normalizedMission.workerBarrierTimeoutMs ||
        (barrierContext.normalizedMission.timeoutMs ? Math.min(8000, Math.floor(barrierContext.normalizedMission.timeoutMs * 0.35)) : 60000)
    });
  } catch (error) {
    if (resolveTimeoutFlag(error)) {
      partial = true;
    } else {
      degradedUsable = await degradeOrHalt({
        agentId: barrierContext.agentId,
        workers: workers,
        error: error
      });
      partial = true;
    }
  }
  await finishBarrier({
    db: barrierContext.db,
    agentId: barrierContext.agentId,
    normalizedMission: barrierContext.normalizedMission,
    autonomyPlan: barrierContext.autonomyPlan,
    contractRecord: barrierContext.contractRecord,
    workers: workers,
    partial: partial,
    degradedUsable: degradedUsable
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
  await finalizePartial({
    agentId: ctx.agentId,
    workers: ctx.workers,
    usable: usable,
    normalizedMission: ctx.normalizedMission,
    autonomyPlan: ctx.autonomyPlan
  });
}

async function finishSatisfiedBarrier(ctx) {
  const dossiers = loadDossiers({ agentId: ctx.agentId, workers: ctx.workers });
  validateWorkerDossiers(dossiers, ctx.workers, { contract: readContract({ contractRecord: ctx.contractRecord }) });
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
  runEvidenceBarrier
};
