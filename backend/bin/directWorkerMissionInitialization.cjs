'use strict';

async function initializeDirectWorkerMission(input, services) {
  const request = workspaceRequest(input.request || {});
  await services.initializeMission({ db: input.db, action: 'dispatch_worker',
    orchestratorId: input.orchestratorId, task: input.task, request });
  await services.missionIdentity.create(input.db, { missionId: input.missionId,
    objective: input.task, orchestratorAgentId: input.orchestratorId });
}

function workspaceRequest(request) {
  if (request.workspaceRoot || request.workspace_root || request.workspaceId || request.workspace_id) return request;
  return process.env.GENOS_WORKSPACE_ROOT ? { ...request, workspaceRoot: process.env.GENOS_WORKSPACE_ROOT } : request;
}

module.exports = { initializeDirectWorkerMission, workspaceRequest };
