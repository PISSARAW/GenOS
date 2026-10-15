'use strict';

async function observe(ctx, outcome) {
  const mission = ctx.normalizedMission;
  return require('./workerCellThreadRuntime').observeOutcome(ctx.db, {
    executionMode: ctx.dispatchedAgent.execution_mode,
    workerId: ctx.agentId, missionId: mission.missionId,
    episodeId: mission.episodeId || mission.missionScope?.episodeId,
    threadId: mission.threadId || mission.missionScope?.threadId,
    status: outcome.status,
    reason: outcome.payload?.domainVerdict || outcome.task
  });
}

module.exports = { observe };
