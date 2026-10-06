'use strict';

const { withTransaction } = require('../db');
const store = require('./garageQueueStore');
const { error } = require('./garageRequests');
const processes = require('./garageProcessControl');

async function cancel(input, row) {
  row = await lockCancellation(input);
  if (!['queued','claimed','running'].includes(row.status)) return { requestId: row.request_id, status: row.status, cancelled: false };
  if (row.status === 'running') await (input.stopVerified || processes.stopVerified)({ ...input, workerId: row.worker_id });
  await withTransaction(input.db, async () => {
    await input.db.run(`UPDATE garage_queue SET status = 'cancelled', phase = 'ready',
      updated_at = CURRENT_TIMESTAMP WHERE request_id = ? AND phase = 'cancelling'`, row.request_id);
    await input.db.run("UPDATE garage_capsules SET status = 'cancelled' WHERE request_id = ? AND status = 'frozen'", row.request_id);
    await store.event(input.db, row, { type: 'cancelled' });
  });
  if (row.status === 'running' || row.phase === 'frozen') {
    await require('./workerGarageService').enterIdleState(input.db, row.worker_id, row.orchestrator_id);
  }
  return { requestId: row.request_id, status: 'cancelled' };
}

async function lockCancellation(input) {
  return withTransaction(input.db, async () => {
    const row = await input.db.get('SELECT * FROM garage_queue WHERE request_id = ? AND orchestrator_id = ?', input.requestId, input.orchestratorId);
    if (!row) throw error('AGENT_NOT_FOUND', 'Request not found.');
    if (['freezing','thawing'].includes(row.phase)) throw error('GARAGE_OPERATION_BUSY', 'A capsule operation is in progress.');
    if (['queued','claimed','running'].includes(row.status)) {
      await input.db.run("UPDATE garage_queue SET phase = 'cancelling', owner_id = ?, updated_at = CURRENT_TIMESTAMP WHERE request_id = ?", String(process.pid), row.request_id);
    }
    return row;
  });
}

async function resume(input, row) {
  if (row.phase === 'frozen') return require('./garagePreemptionService').thawWorker({ ...input,
    workerId: row.worker_id, snapshotId: row.snapshot_id });
  if (row.status !== 'queued' || row.phase !== 'dormant') throw error('GARAGE_STATE_INVALID', 'Request is not dormant or frozen.');
  const result = await input.db.run("UPDATE garage_queue SET phase = 'ready', updated_at = CURRENT_TIMESTAMP WHERE request_id = ? AND status = 'queued' AND phase = 'dormant'", row.request_id);
  if (!result.changes) throw error('GARAGE_OPERATION_BUSY', 'Dormant request changed before wake.');
  await store.event(input.db, row, { type: 'awakened' });
  return { requestId: row.request_id, status: 'queued' };
}

async function control(input) {
  const row = await input.db.get('SELECT * FROM garage_queue WHERE request_id = ? AND orchestrator_id = ?', input.requestId, input.orchestratorId);
  if (!row) throw error('AGENT_NOT_FOUND', 'Request not found in selected garage.');
  await (input.authorize || require('./agentAuthorityService').authorizeAgentControl)(input.db, { targetId: row.worker_id, actorId: row.orchestrator_id });
  const actions = {
    cancel: () => cancel(input, row), resume: () => resume(input, row),
    freeze: () => require('./garagePreemptionService').freezeWorker({ ...input, workerId: row.worker_id }),
    renew: async () => ({ requestId: row.request_id, renewed: await store.renewPersistent(input.db,
      { requestId: row.request_id, leaseId: row.lease_id }) })
  };
  if (!Object.hasOwn(actions, input.action)) throw error('GARAGE_ACTION_INVALID', 'Expected cancel, resume, freeze or renew.');
  return actions[input.action]();
}

module.exports = { control };
