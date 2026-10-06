'use strict';

const { withTransaction } = require('../db');
const store = require('./garageQueueStore');
const requests = require('./garageRequests');
const garage = () => require('./workerGarageService');

async function submit(db, request) {
  await require('./agentAuthorityService').authorizeMission(db, {
    agentId: request.workerId, orchestratorAgentId: request.orchestratorId,
    workspaceId: request.workspaceId, toolLease: request.toolLease
  });
  if (request.queueIfFull === false) await garage().requireAvailableSlot(db, request.orchestratorId);
  const row = await store.enqueuePersistent(db, request);
  await require('./garageSchedulingService').preemptFor(db, row);
  require('./garageRuntimeService').start({ db });
  const dispatched = await require('./garageQueueDispatcher').drainOne({ db, orchestratorId: row.orchestrator_id });
  return { requestId: row.request_id, mode: row.mode, queued: dispatched?.requestId !== row.request_id || !dispatched.started,
    started: dispatched?.requestId === row.request_id && dispatched.started,
    status: (await db.get('SELECT status FROM garage_queue WHERE request_id = ?', row.request_id)).status };
}

async function adopt(ctx) {
  const mission = ctx.normalizedMission;
  if (ctx.dispatchedAgent.execution_mode !== 'worker' || mission.garageRequestId) return;
  const request = { ...mission, orchestratorId: mission.orchestratorAgentId, workerId: ctx.agentId };
  await withTransaction(ctx.db, async () => {
    const busy = await ctx.db.get(`SELECT request_id FROM garage_queue WHERE worker_id = ?
      AND (status IN ('queued','claimed','running') OR phase IN ('frozen','thawing','freezing'))`, ctx.agentId);
    if (busy) throw requests.error('GARAGE_DUPLICATE_RUNTIME', 'Worker already has a durable claim.');
    if (ctx.dispatchedAgent.status !== 'running') {
      await garage().reserveSlot(ctx.db, { ...request, mission: mission.prompt });
    }
    const row = await store.enqueuePersistent(ctx.db, request);
    const lease = require('./garageFabricService').createLease({ orchestratorId: request.orchestratorId, workerId: ctx.agentId, ttlMs: 60000 });
    await ctx.db.run(`UPDATE garage_queue SET status = 'running', phase = 'ready', lease_id = ?,
      lease_expires_at = ?, owner_id = ?, attempts = 1, started_at = CURRENT_TIMESTAMP WHERE request_id = ?`,
    lease.leaseId, new Date(lease.expiresAt).toISOString(), String(process.pid), row.request_id);
    await store.event(ctx.db, { ...row, lease_id: lease.leaseId }, { type: 'running', payload: { source: 'runtime_adoption' } });
    mission.garageRequestId = row.request_id;
    mission.garageLeaseId = lease.leaseId;
  });
  require('./garageRuntimeService').start({ db: ctx.db });
}

async function provisionWorker(ctx) {
  const mission = ctx.normalizedMission;
  if (ctx.dispatchedAgent.execution_mode !== 'worker' || mission.workspaceProvisioned) return;
  if (!['Branch', 'Sandbox', 'Container'].includes(mission.workspaceIsolation)) return;
  const source = mission.workspaceRoot;
  if (!source) return;
  mission.workspaceRoot = await require('./agentWorkspaceLifecycleService').createIsolatedWorkspace(source, ctx.agentId);
  mission.workspaceProvisioned = true;
}

module.exports = { submit, adopt, provisionWorker };
