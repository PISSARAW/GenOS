'use strict';

const { resolve } = require('./garagePolicies');
const garage = () => require('./workerGarageService');

async function preemptFor(db, incoming) {
  const request = JSON.parse(incoming.request_json);
  if (incoming.phase !== 'ready') return null;
  if (!resolve(incoming.mode).preemption || request.urgency < 0.8) return null;
  const state = await garage().state(db, incoming.orchestrator_id);
  if (state.available > 0) return null;
  const candidate = await db.get(`SELECT q.* FROM garage_queue q
    JOIN agent_capsule_cleanup c ON c.agent_id = q.worker_id
    WHERE q.orchestrator_id = ? AND q.status = 'running' AND q.phase = 'ready'
      AND q.priority < ? AND q.worker_id != ? AND q.mode != 'collector'
      AND json_extract(q.request_json, '$.preemptible') = 1 ORDER BY q.priority, q.created_at LIMIT 1`,
  incoming.orchestrator_id, incoming.priority, incoming.worker_id);
  if (!candidate) return null;
  return require('./garagePreemptionService').freezeWorker({ db, workerId: candidate.worker_id,
    orchestratorId: candidate.orchestrator_id, reason: `Urgent request ${incoming.request_id}` });
}

async function resumeWaiting(input) {
  const rows = await input.db.all(`SELECT * FROM garage_queue WHERE status = 'queued'
    AND phase = 'frozen' AND mode != 'cold_storage' ORDER BY priority DESC, created_at LIMIT 20`);
  for (const row of rows) {
    const state = await garage().state(input.db, row.orchestrator_id);
    if (!state.available) continue;
    try {
      await require('./garagePreemptionService').thawWorker({ ...input, workerId: row.worker_id,
        orchestratorId: row.orchestrator_id, snapshotId: row.snapshot_id });
    } catch (failure) {
      console.error('[GarageFabric] Resume blocked:', row.request_id, failure.message);
    }
  }
}

async function recoverInterrupted(input) {
  const rows = await input.db.all(`SELECT * FROM garage_queue WHERE phase IN ('freezing','thawing','cancelling')
    AND updated_at < datetime('now', '-30 seconds')`);
  for (const row of rows) {
    if (require('./garageProcessControl').pidAlive(row.owner_id)) continue;
    const phase = row.phase === 'thawing' ? 'frozen' : 'freeze_failed';
    await input.db.run(`UPDATE garage_queue SET phase = ?, error_text = 'interrupted_operation_requires_control'
      WHERE request_id = ? AND phase = ?`, phase, row.request_id, row.phase);
    await require('./garageQueueStore').event(input.db, row, { type: 'interrupted_operation', payload: { phase } });
  }
}

module.exports = { preemptFor, resumeWaiting, recoverInterrupted };
