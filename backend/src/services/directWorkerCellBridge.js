'use strict';

const cells = require('./workerCellThreadRuntime');

async function prepare(db, input) {
  const { context, mission } = input;
  context.workerCellThread = await cells.ensureDispatched(db, {
    missionId: context.missionId, orchestratorId: context.orchestratorId,
    workerId: context.id, missionScope: context.request.missionScope,
    source: 'direct_worker_dispatch'
  });
  return cells.propagate(mission, context.workerCellThread);
}

async function fail(db, context, error) {
  try {
    return await cells.failDispatch(db, context.workerCellThread, error.code || error.message);
  } catch (_) {
    return null;
  }
}

function receipt(context) {
  const cell = context.workerCellThread;
  return cell?.available ? { episodeId: cell.episodeId, threadId: cell.threadId } : {};
}

module.exports = { prepare, fail, receipt };
