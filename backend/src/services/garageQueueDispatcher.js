'use strict';

const fabric = require('./garageFabricService');

function decodeRequest(row) {
  try { return JSON.parse(row.request_json || '{}'); } catch (_) { return {}; }
}

function reservation(input) {
  if (input.reserveSlot) return input.reserveSlot;
  return require('./workerGarageService').reserveSlot;
}

function launcher(input) {
  if (input.startMission) return input.startMission;
  return require('./agentRuntimeAdapter').startMission;
}

async function markFailure(db, row, error) {
  await fabric.updatePersistent(db, { requestId: row.request_id, status: 'failed', error: error.message });
  return { started: false, requestId: row.request_id, error: error.message };
}

async function drainOne(input = {}) {
  const row = await fabric.claimNextPersistent(input.db, { orchestratorId: input.orchestratorId, ttlMs: input.ttlMs });
  if (!row) return null;
  const request = decodeRequest(row);
  if (!row.worker_id) return markFailure(input.db, row, new Error('Queued garage request has no worker_id.'));
  try {
    await reservation(input)(input.db, {
      orchestratorId: row.orchestrator_id,
      workerId: row.worker_id,
      name: request.name || 'Queued worker',
      role: request.role || 'implementation',
      mission: request.mission || request.prompt || 'Queued garage mission'
    });
    await fabric.updatePersistent(input.db, { requestId: row.request_id, status: 'running' });
    const mission = { ...request, agentId: row.worker_id, orchestratorAgentId: row.orchestrator_id, prompt: request.prompt || request.mission };
    Promise.resolve(launcher(input)(mission)).then(
      (result) => fabric.updatePersistent(input.db, { requestId: row.request_id, status: 'completed', result }).catch(() => {}),
      (error) => fabric.updatePersistent(input.db, { requestId: row.request_id, status: 'failed', error: error.message }).catch(() => {})
    );
    return { started: true, requestId: row.request_id, workerId: row.worker_id, leaseId: row.leaseId };
  } catch (error) {
    return markFailure(input.db, row, error);
  }
}

module.exports = { drainOne };
