'use strict';

const crypto = require('crypto');
const { withTransaction } = require('../db');
const store = require('./garageQueueStore');
const requests = require('./garageRequests');
const processControl = require('./garageProcessControl');
const capsules = require('./garageCapsuleService');

async function authorize(input) {
  await requests.scope(input.db, input);
  await (input.authorize || require('./agentAuthorityService').authorizeAgentControl)(input.db, {
    targetId: input.workerId, actorId: input.orchestratorId
  });
}

async function lockFreeze(input) {
  return withTransaction(input.db, async () => {
    const row = await input.db.get(`SELECT * FROM garage_queue WHERE worker_id = ? AND orchestrator_id = ?
      AND status = 'running' AND phase = 'ready'`, input.workerId, input.orchestratorId);
    if (!row) throw requests.error('GARAGE_PREEMPTION_UNAVAILABLE', 'No active Garage Fabric execution.');
    const request = JSON.parse(row.request_json);
    if (request.preemptible !== true || row.mode === 'collector') throw requests.error('GARAGE_PREEMPTION_PROTECTED', 'Worker did not consent to suspension.');
    await input.db.run("UPDATE garage_queue SET phase = 'freezing', owner_id = ?, updated_at = CURRENT_TIMESTAMP WHERE request_id = ? AND lease_id = ?", String(process.pid), row.request_id, row.lease_id);
    await store.event(input.db, row, { type: 'freezing' });
    return row;
  });
}

async function freezeWorker(input = {}) {
  await authorize(input);
  const row = await lockFreeze(input);
  try {
    await (input.stopVerified || processControl.stopVerified)(input);
    const state = await (input.capture || capsules.capture)(input, row);
    if (state.workerId !== input.workerId || state.orchestratorId !== input.orchestratorId) throw requests.error('GARAGE_CAPSULE_CORRUPT', 'Capture identity mismatch.');
    const snapshotId = `garage-snapshot-${crypto.randomUUID()}`;
    await withTransaction(input.db, async () => {
      await input.db.run(`INSERT INTO garage_capsules(snapshot_id, request_id, worker_id, orchestrator_id,
        workspace_id, capsule_hash, state_json) VALUES (?, ?, ?, ?, ?, ?, ?)`, snapshotId,
      row.request_id, row.worker_id, row.orchestrator_id, state.workspaceId, requests.hash(state), JSON.stringify(state));
      await input.db.run(`UPDATE garage_queue SET status = 'queued', phase = 'frozen', snapshot_id = ?,
        lease_id = NULL, lease_expires_at = NULL WHERE request_id = ? AND phase = 'freezing'`, snapshotId, row.request_id);
      await input.db.run("UPDATE agents SET status = 'blocked', current_task = ? WHERE id = ?", `[GARAGE] Frozen ${snapshotId}`, input.workerId);
      await store.event(input.db, row, { type: 'frozen', payload: { snapshotId } });
    });
    return { workerId: row.worker_id, requestId: row.request_id, snapshotId, status: 'frozen', runtimeStopped: true };
  } catch (failure) {
    // No verified capsule: never pretend suspension succeeded or make the worker reusable.
    await input.db.run("UPDATE garage_queue SET phase = 'freeze_failed', error_text = ? WHERE request_id = ?", failure.message, row.request_id);
    await input.db.run("UPDATE agents SET status = 'blocked', current_task = 'Stopping on operator request' WHERE id = ?", input.workerId);
    throw failure;
  }
}

async function lockThaw(input) {
  return withTransaction(input.db, async () => {
    const capsule = await input.db.get(`SELECT c.* FROM garage_capsules c JOIN garage_queue q ON q.snapshot_id = c.snapshot_id
      WHERE c.snapshot_id = ? AND c.worker_id = ? AND c.orchestrator_id = ?
        AND c.status = 'frozen' AND q.phase = 'frozen' AND q.status = 'queued'`,
    input.snapshotId, input.workerId, input.orchestratorId);
    if (!capsule) throw requests.error('GARAGE_CAPSULE_NOT_FOUND', 'Frozen capsule not found in the selected garage.');
    await input.db.run("UPDATE garage_queue SET phase = 'thawing', owner_id = ?, updated_at = CURRENT_TIMESTAMP WHERE request_id = ?", String(process.pid), capsule.request_id);
    return capsule;
  });
}

async function thawWorker(input = {}) {
  await authorize(input);
  if (await processControl.isAlive(input.db, input.workerId)) throw requests.error('GARAGE_RUNTIME_LIVE', 'Cannot thaw a live worker.');
  const capsule = await lockThaw(input);
  try {
    const restored = await (input.restore || capsules.restore)(input, capsule);
    await withTransaction(input.db, async () => {
      await input.db.run(`UPDATE garage_queue SET phase = 'ready', request_json = ?, result_json = NULL,
        error_text = NULL, updated_at = CURRENT_TIMESTAMP WHERE request_id = ? AND phase = 'thawing'`, JSON.stringify(restored), capsule.request_id);
      await input.db.run("UPDATE garage_capsules SET status = 'thawed', thawed_at = CURRENT_TIMESTAMP WHERE snapshot_id = ?", capsule.snapshot_id);
      await input.db.run("UPDATE agents SET status = 'idle', current_task = NULL WHERE id = ?", input.workerId);
      await store.event(input.db, { request_id: capsule.request_id, orchestrator_id: input.orchestratorId }, { type: 'thawed' });
    });
    return { workerId: input.workerId, requestId: capsule.request_id, snapshotId: capsule.snapshot_id, status: 'queued' };
  } catch (failure) {
    await input.db.run("UPDATE garage_queue SET phase = 'frozen', error_text = ? WHERE request_id = ?", failure.message, capsule.request_id);
    throw failure;
  }
}

module.exports = { freezeWorker, thawWorker };
