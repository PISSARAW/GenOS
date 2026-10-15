'use strict';

async function activate(ctx) {
  if (ctx.dispatchedAgent.execution_mode !== 'worker') return null;
  const scope = ctx.normalizedMission.missionScope;
  if (!scope?.threadId) return null;
  const workspace = await ctx.db.get(`SELECT organization_id, project_id
    FROM workspaces WHERE id = ?`, ctx.dispatchedAgent.workspace_id);
  if (!workspace?.organization_id || !workspace.project_id) {
    throw Object.assign(new Error('Worker cell activation requires a tenant-scoped workspace.'), {
      code: 'WORKER_CELL_SCOPE_UNAVAILABLE'
    });
  }
  const runtime = await require('./workerCellThreadRuntime').activate(ctx.db, {
    executionMode: 'worker', missionId: ctx.normalizedMission.missionId,
    workerId: ctx.agentId, missionScope: scope,
    organizationId: workspace.organization_id, projectId: workspace.project_id
  });
  ctx.workerCellThread = runtime;
  ctx.normalizedMission.episodeId = runtime.episodeId;
  ctx.normalizedMission.threadId = runtime.threadId;
  return runtime;
}

module.exports = { activate };
