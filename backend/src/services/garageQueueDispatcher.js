'use strict';

const fabric = require('./garageFabricService');
const { withTransaction } = require('../db');
const requests = require('./garageRequests');
const transient = new Set(['WORKER_GARAGE_FULL', 'PROJECT_WORKER_CAPACITY_FULL', 'WORKER_NOT_IDLE', 'WORKER_ALREADY_RUNNING']);

async function authorize(input, request) {
  await requests.scope(input.db, request);
  const circuit = require('./circuitBreaker').canExecute('worker_deployment', 'operator');
  if (!circuit.allowed) throw requests.error(circuit.reason, circuit.message);
  await (input.authorize || require('./agentAuthorityService').authorizeMission)(input.db, {
    agentId: request.workerId, orchestratorAgentId: request.orchestratorId,
    workspaceId: request.workspaceId, toolLease: request.toolLease
  });
}

async function reserve(input, row) {
  const request = JSON.parse(row.request_json);
  await authorize(input, request);
  await (input.reserveSlot || require('./workerGarageService').reserveSlot)(input.db, {
    orchestratorId: row.orchestrator_id, workerId: row.worker_id,
    garageRequestId: row.request_id, garageLeaseId: row.lease_id,
    name: request.name, role: request.role, mission: request.prompt
  });
  const transitioned = await fabric.updatePersistent(input.db, {
    requestId: row.request_id, leaseId: row.lease_id, status: 'running'
  });
  if (!transitioned) throw requests.error('GARAGE_STALE_CLAIM', 'Claim was revoked before dispatch.');
  return { ...request, agentId: row.worker_id, orchestratorAgentId: row.orchestrator_id,
    garageRequestId: row.request_id, garageLeaseId: row.lease_id };
}

async function fail(input, row, error) {
  const retry = transient.has(error.code);
  await fabric.updatePersistent(input.db, { requestId: row.request_id, leaseId: row.lease_id,
    status: retry ? 'queued' : 'failed', error: error.code || error.message });
  if (retry) await input.db.run(`UPDATE garage_queue SET not_before = datetime('now', '+1 second')
    WHERE request_id = ? AND status = 'queued' AND lease_id = ?`, row.request_id, row.lease_id);
  return { started: false, queued: retry, requestId: row.request_id, error: error.code || error.message };
}

async function observe(input, row, mission) {
  try {
    const result = await (input.startMission || require('./agentRuntimeAdapter').startMission)(mission);
    if (result?.duplicate) throw requests.error('GARAGE_DUPLICATE_RUNTIME', 'Runtime already owns another execution.');
    await require('./garageRuntimeService').reconcileOne(input, row.request_id);
  } catch (error) {
    const alive = await require('./garageProcessControl').isAlive(input.db, row.worker_id);
    if (!alive) {
      await fail(input, row, error);
      await require('./workerGarageService').enterIdleState(input.db, row.worker_id, row.orchestrator_id);
    } else {
      await fabric.event(input.db, row, { type: 'launch_error_live_runtime', payload: { code: error.code || 'RUNTIME_ERROR' } });
    }
  }
}

async function drainOne(input = {}) {
  let row;
  try {
    const mission = await withTransaction(input.db, async () => {
      row = await fabric.claimNextPersistent(input.db, input);
      return row ? reserve(input, row) : null;
    });
    if (!mission) return null;
    const completion = observe(input, row, mission).catch((error) => console.error('[GarageFabric] Observation failed:', error.message));
    return { started: true, requestId: row.request_id, workerId: row.worker_id, leaseId: row.lease_id, completion };
  } catch (error) {
    // Claim and capacity reservation roll back together on backpressure.
    if (!row) throw error;
    if (!transient.has(error.code)) {
      await input.db.run(`UPDATE garage_queue SET status = 'failed', error_text = ?
        WHERE request_id = ? AND status = 'queued'`, error.code || error.message, row.request_id);
    }
    return { started: false, queued: transient.has(error.code), requestId: row.request_id, error: error.code || error.message };
  }
}

module.exports = { drainOne };
