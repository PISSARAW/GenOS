/**
 * Sequential specialist pipeline: dependency validation and staged dispatch.
 */
const { emit, updateAgent } = require('./agentOrchestrationState');
const { workerEvidenceDossiers, recordWorkerEvidence } = require('./agentEvidenceService');
const { latestReport } = require('./trinityComparativeBarrier');
const handoffEvidence = require('./aTeamHandoffEvidenceService');
const handoffService = require('./aTeam/handoff/handoffService');
const workspaceHandoff = require('./aTeamWorkspaceHandoffService');
const workerGarage = require('./workerGarageService');
const { advanceAutonomousRound } = require('./agentRoundService');
const { scheduleWorkspaceCleanup } = require('./agentWorkspaceLifecycleService');
const { waitForAutonomousWorkerQuiescence } = require('./workerEvidenceBarrierQuiescence');
const externalRecovery = require('./workerExternalRecoveryPipeline');
const dependencies = require('./workerEvidenceBarrierDependencies');
const { indexWorkersByKey, validateWorkerDependencies, collectStages, workersForStage, throwIfStageBlocked } = dependencies;

function collectPrerequisites(stageWorkers) {
  const prerequisites = new Set();
  for (const worker of stageWorkers) {
    const deps = worker.dependsOn;
    if (!deps) continue;
    for (const dependency of deps) {
      prerequisites.add(dependency);
    }
  }
  return prerequisites;
}

function buildStageHandoff(orchestratorId, workers, consumer) {
  const producers = (consumer.dependsOn || []).map((dependency) => workers.find((worker) => worker.agentId === dependency || worker.label === dependency || worker.subSystem === dependency)).filter(Boolean);
  const dossiers = workerEvidenceDossiers(orchestratorId, producers);
  return handoffEvidence.buildHandoffsFromDossiers({
    plan: { members: workers },
    consumer,
    dossiers
  });
}

async function prepareStageHandoff(ctx) {
  let handoffCount = 0;
  for (const worker of ctx.stageWorkers) {
    if (externalRecovery.hasDependency(worker, ctx.byKey)) continue;
    const handoff = buildStageHandoff(ctx.orchestratorId, ctx.workers, worker);
    if (!handoff.ok) {
      throw Object.assign(new Error(`No validated evidence handoff exists for dependency '${handoff.missingDependency}'.`), { code: 'WORKER_DEPENDENCY_NOT_READY' });
    }
    if (!handoff.handoffs.every((item) => handoffService.validate(item).valid)) {
      throw Object.assign(new Error(`Stage ${ctx.stage} contains an invalid typed handoff.`), { code: 'INVALID_A_TEAM_HANDOFF' });
    }
    worker.handoffContext = handoff.handoffs;
    await materializeStageHandoff(ctx, worker, worker.handoffContext);
    worker.prompt = handoffEvidence.missionWithHandoffs(worker.prompt, worker.handoffContext);
    handoffCount += worker.handoffContext.length;
  }
  emit(ctx.orchestratorId, 'SPECIALIST_PIPELINE_STAGE_STARTED', 'HANDOFF', 'Starting specialist pipeline stage ' + String(ctx.stage) + ' with ' + String(ctx.stageWorkers.length) + ' worker(s).', {
    stage: ctx.stage,
    workerIds: workerIdList(ctx.stageWorkers),
    sourceDossierCount: handoffCount
  }, 'info');
}

async function materializeStageHandoff(ctx, consumer, handoffs) {
  const byWorker = new Map(ctx.workers.map((worker) => [worker.agentId, worker]));
  const receipts = await workspaceHandoff.materializeHandoffs({ consumer, handoffs, byWorker });
  if (receipts.length) {
    emit(ctx.orchestratorId, 'ATEAM_STAGE_HANDOFF_MATERIALIZED', 'HANDOFF',
      'Imported the verified producer commit into the isolated consumer capsule.', {
        stage: ctx.stage, consumerId: consumer.agentId,
        handoffs: receipts.map((receipt) => ({ commit: receipt.commit }))
      }, 'info');
  }
  return receipts;
}

function workerIdList(workers) {
  return workers.map((worker) => worker.agentId);
}

async function telemetryWatermark(db) {
  const row = await db.get('SELECT COALESCE(MAX(rowid), 0) AS watermark FROM telemetry_events');
  return Number(row?.watermark || 0);
}

async function countStartedWorkers(ctx, watermark) {
  const workerIds = workerIdList(ctx.stageWorkers);
  if (!workerIds.length) return 0;
  const placeholders = workerIds.map(() => '?').join(', ');
  const row = await ctx.db.get(
    `SELECT COUNT(DISTINCT agent_id) AS count FROM telemetry_events WHERE event_type = 'AGENT_RUNTIME_STARTED' AND rowid > ? AND agent_id IN (${placeholders})`,
    watermark,
    ...workerIds
  );
  return Number(row?.count || 0);
}

async function readWorkerOutcomes(ctx) {
  const workerIds = workerIdList(ctx.stageWorkers);
  if (!workerIds.length) return [];
  const placeholders = workerIds.map(() => '?').join(', ');
  return ctx.db.all(`SELECT id, status FROM agents WHERE id IN (${placeholders})`, ...workerIds);
}

function isFailedWorkerStatus(status) {
  return ['error', 'failed', 'terminated', 'apoptosis', 'quarantined', 'unverified'].includes(String(status).toLowerCase());
}

function emitStageReconciliation(ctx, outcome) {
  const { startedWorkers, rows, dispatchFailures } = outcome;
  const completedWorkers = rows.filter((row) => String(row.status).toLowerCase() === 'completed').length;
  const failedWorkers = rows.filter((row) => isFailedWorkerStatus(row.status)).length + dispatchFailures;
  const blockedWorkers = rows.filter((row) => String(row.status).toLowerCase() === 'blocked').length;
  const pendingWorkers = rows.length - completedWorkers - failedWorkers - blockedWorkers;
  emit(ctx.orchestratorId, 'WORKER_STAGE_DISPATCH_RECONCILED', 'RECONCILE', 'Reconciled terminal worker states for pipeline stage ' + String(ctx.stage) + '.', {
    stage: ctx.stage,
    selectedWorkers: ctx.stageWorkers.length,
    startedWorkers: startedWorkers,
    completedWorkers: completedWorkers,
    failedWorkers: failedWorkers,
    blockedWorkers: blockedWorkers,
    pendingWorkers: pendingWorkers,
    workerIds: workerIdList(ctx.stageWorkers)
  }, failedWorkers || blockedWorkers || pendingWorkers ? 'warning' : 'info');
}

async function reserveStageSlots(ctx) {
  const reserved = [];
  try {
    for (const worker of ctx.stageWorkers) {
      await workerGarage.reserveSlot(ctx.db, {
        orchestratorId: ctx.orchestratorId,
        workerId: worker.agentId,
        name: worker.name,
        role: worker.role,
        mission: worker.prompt
      });
      reserved.push(worker);
    }
  } catch (error) {
    await rollbackStageReservations(ctx, reserved);
    throw error;
  }
}

async function rollbackStageReservations(ctx, workers) {
  const results = await Promise.allSettled(workers.map((worker) => workerGarage.releaseSlot(ctx.db, {
    orchestratorId: ctx.orchestratorId,
    workerId: worker.agentId
  })));
  const failed = results.flatMap((result, index) => result.status === 'rejected' || !result.value ? [workers[index].agentId] : []);
  if (failed.length) {
    emit(ctx.orchestratorId, 'WORKER_STAGE_RESERVATION_ROLLBACK_FAILED', 'GARAGE', 'Could not release every slot after stage reservation failed.', {
      stage: ctx.stage,
      workerIds: failed
    }, 'error');
  }
}

function startMissionFor(worker, contract) {
  const adapter = require('./agentRuntimeAdapter');
  const payload = Object.assign({}, worker);
  payload.strategyContract = contract;
  payload.autonomousOrchestration = false;
  return adapter.startMission(payload);
}

async function dispatchStageWorkers(ctx, launchWorker = startMissionFor) {
  emit(ctx.orchestratorId, 'WORKER_STAGE_DISPATCH_REQUESTED', 'DISPATCH', 'Starting every worker in the current pipeline stage concurrently.', {
    stage: ctx.stage,
    selectedWorkers: ctx.stageWorkers.length,
    workerIds: workerIdList(ctx.stageWorkers)
  }, 'info');
  return Promise.all(ctx.stageWorkers.map(async (worker) => {
    try {
      await launchWorker(worker, ctx.contract);
      return { ok: true, worker: worker };
    } catch (reason) {
      return { ok: false, worker: worker, reason: reason };
    }
  }));
}

async function releaseSlotAfterFailure(ctx, worker) {
  const garage = await workerGarage.state(ctx.orchestratorId).catch(() => null);
  let capacity = workerGarage.MAX_ACTIVE_WORKERS;
  if (garage) {
    if (garage.capacity) capacity = garage.capacity;
  }
  let occupied = undefined;
  let available = undefined;
  if (garage) {
    occupied = garage.occupied;
    available = garage.available;
  }
  emit(ctx.orchestratorId, 'WORKER_SLOT_RELEASED', 'GARAGE', 'Worker released its active slot after failed dispatch.', {
    workerId: worker.agentId,
    capacity: capacity,
    occupied: occupied,
    available: available
  }, 'warning');
}

async function reportDispatchFailure(ctx, worker, reason) {
  await updateAgent(worker.agentId, 'error', reason.message).catch(() => undefined);
  await releaseSlotAfterFailure(ctx, worker);
  await scheduleWorkspaceCleanup(worker.agentId).catch(() => undefined);
  emit(ctx.orchestratorId, 'AUTONOMOUS_WORKER_DISPATCH_FAILED', 'DISPATCH', reason.message, { workerId: worker.agentId, stage: ctx.stage }, 'error');
  const failureEvent = {
    eventType: 'AGENT_FAILED',
    action: 'DISPATCH',
    detail: reason.message,
    payload: { failure: { category: 'dispatch_failure', reason: reason.message } }
  };
  try { await recordWorkerEvidence(worker, failureEvent); } catch (_) {}
  await advanceAutonomousRound(worker, { eventType: 'AGENT_RUNTIME_ERROR', payload: {}, detail: reason.message });
}

function hasRunnableExecutable(executable) {
  if (!executable) return false;
  try {
    const fs = require('fs');
    return fs.existsSync(executable) && fs.statSync(executable).isFile();
  } catch (_) {
    return false;
  }
}

async function reconcileDispatchResults(ctx, results) {
  for (const result of results) {
    if (result.ok) continue;
    await reportDispatchFailure({ orchestratorId: ctx.orchestratorId, stage: ctx.stage }, result.worker, result.reason);
  }
}

async function waitStageQuiescence(ctx) {
  await waitForAutonomousWorkerQuiescence(ctx.db, ctx.orchestratorId, workerIdList(ctx.workers), {
    timeoutMs: ctx.timeoutMs,
    isCancelled: ctx.isCancelled,
    ignoreRoundPending: ctx.ignoreRound
  });
}

function cancelFlagReader(barrier) {
  return () => barrier.cancelled;
}

async function runSingleStage(ctx) {
  if (ctx.stageIndex > 0) {
    const prerequisites = collectPrerequisites(ctx.stageWorkers);
    await throwIfStageBlocked({ db: ctx.db, orchestratorId: ctx.orchestratorId, stage: ctx.stage, prerequisites: prerequisites, byKey: ctx.byKey });
    await prepareStageHandoff({
      db: ctx.db,
      orchestratorId: ctx.orchestratorId,
      workers: ctx.workers,
      byKey: ctx.byKey,
      stageWorkers: ctx.stageWorkers,
      stage: ctx.stage
    });
    await externalRecovery.bindReferences(ctx);
  }
  const garage = await workerGarage.state(ctx.db, ctx.orchestratorId);
  const effectiveCapacity = Math.max(1, Math.floor(Number(garage.capacity) || workerGarage.MAX_ACTIVE_WORKERS));
  const batches = [];
  for (let offset = 0; offset < ctx.stageWorkers.length; offset += effectiveCapacity) {
    batches.push(ctx.stageWorkers.slice(offset, offset + effectiveCapacity));
  }
  if (batches.length > 1) {
    emit(ctx.orchestratorId, 'WORKER_STAGE_CAPACITY_REBATCHED', 'GARAGE',
      'Split a planned pipeline stage into batches that fit the measured garage capacity.', {
        stage: ctx.stage, plannedWorkers: ctx.stageWorkers.length,
        effectiveCapacity, batches: batches.length
      }, 'warning');
  }
  for (const [batchIndex, stageWorkers] of batches.entries()) {
    await runStageBatch({ ...ctx, stageWorkers, batchIndex, batchCount: batches.length });
  }
}

async function runStageBatch(ctx) {
  await reserveStageSlots({ db: ctx.db, orchestratorId: ctx.orchestratorId, stageWorkers: ctx.stageWorkers });
  const watermark = await telemetryWatermark(ctx.db);
  const results = await dispatchStageWorkers({ stageWorkers: ctx.stageWorkers, contract: ctx.contract });
  await reconcileDispatchResults({ orchestratorId: ctx.orchestratorId, stage: ctx.stage }, results);
  let waitError = null;
  try {
    await waitStageQuiescence({
      db: ctx.db,
      orchestratorId: ctx.orchestratorId,
      workers: ctx.stageWorkers,
      timeoutMs: ctx.timeoutMs,
      isCancelled: cancelFlagReader(ctx.barrier),
      ignoreRound: ctx.ignoreRound
    });
  } catch (error) {
    waitError = error;
  }
  emitStageReconciliation(ctx, {
    startedWorkers: await countStartedWorkers(ctx, watermark),
    rows: await readWorkerOutcomes(ctx),
    dispatchFailures: results.filter((result) => !result.ok).length
  });
  if (waitError) throw waitError;
}

async function executeWorkerPipeline(pipelineContext) {
  const workers = pipelineContext.workers;
  const byKey = indexWorkersByKey(workers);
  validateWorkerDependencies(workers, byKey);
  const stages = collectStages(workers);
  let stageIndex = 0;
  for (const stage of stages) {
    const stageWorkers = workersForStage(workers, stage);
    let ignoreRound = false;
    if (stageIndex === stages.length - 1) ignoreRound = true;
    await runSingleStage({
      db: pipelineContext.db,
      orchestratorId: pipelineContext.orchestratorId,
      workers: workers,
      byKey: byKey,
      stageWorkers: stageWorkers,
      stage: stage,
      stageIndex: stageIndex,
      contract: pipelineContext.contract,
      barrier: pipelineContext.barrier,
      timeoutMs: pipelineContext.timeoutMs,
      ignoreRound: ignoreRound
    });
    stageIndex = stageIndex + 1;
  }
}

module.exports = { executeWorkerPipeline, dispatchStageWorkers, materializeStageHandoff,
  bindExternalRecoveryReferences: externalRecovery.bindReferences,
  validExternalCreditReport: externalRecovery.validReport,
  hasExternalCreditRecoveryDependency: externalRecovery.hasDependency };
