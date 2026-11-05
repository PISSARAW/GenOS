'use strict';

const cells = require('./workerCellThreadRuntime');

async function bind(db, input) {
  const { worker, episode, orchestratorId } = input;
  const missionScope = { ...worker.missionScope, available: episode.available,
    episodeId: episode.episodeId, rootThreadId: episode.rootThreadId };
  const runtime = await cells.ensureDispatched(db, {
    missionId: worker.missionId, orchestratorId, workerId: worker.agentId,
    missionScope, source: 'autonomous_trinity_dispatch'
  });
  worker.cellThreadRuntime = runtime;
  return cells.propagate(worker, runtime);
}

async function bindWorkers(db, input) {
  const preparation = require('./trinityDispatchPreparation');
  const identities = require('./missionIdentityService');
  const episode = await require('./missionEpisodeRuntime').ensure(db, {
    missionId: input.missionId, orchestratorId: input.orchestratorId, action: 'dispatch_trinity', request: {}
  });
  for (const worker of input.workers) {
    const scope = { missionId: input.missionId, trinityExperimentId: input.missionId };
    worker.workspaceId = await preparation.bindWorker(db, { scope, workerId: worker.agentId, workspaceRoot: worker.workspaceRoot });
    await identities.attachAgent(db, { missionId: input.missionId, agentId: worker.agentId, role: 'trinity_worker' });
    worker.missionId = input.missionId;
    worker.missionScope = scope;
    await bind(db, { worker, episode, orchestratorId: input.orchestratorId });
    worker.toolLease = preparation.restrictLease(scope, worker.toolLease);
  }
}

module.exports = { bind, bindWorkers };
