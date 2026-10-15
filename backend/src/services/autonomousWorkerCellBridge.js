'use strict';

const cells = require('./workerCellThreadRuntime');

async function bind(ctx, workers) {
  for (const worker of workers) {
    const runtime = await cells.ensureDispatched(ctx.db, {
      missionId: ctx.normalizedMission.missionId,
      orchestratorId: ctx.agentId, workerId: worker.agentId,
      missionScope: ctx.normalizedMission.missionScope,
      dispatchActionId: ctx.workerDispatchActionId,
      source: 'autonomous_worker_dispatch'
    });
    worker.cellThreadRuntime = runtime;
    cells.propagate(worker, runtime);
  }
  return workers;
}

async function fail(ctx, workers, error) {
  return Promise.allSettled(workers.map((worker) => cells.failDispatch(
    ctx.db, worker.cellThreadRuntime, error.code || error.message)));
}

function receipts(workers) {
  return workers.filter((worker) => worker.cellThreadRuntime?.available).map((worker) => ({
    workerId: worker.agentId,
    episodeId: worker.cellThreadRuntime.episodeId,
    threadId: worker.cellThreadRuntime.threadId
  }));
}

module.exports = { bind, fail, receipts };
