'use strict';

const ACTIVE_QUEUE = ['claimed', 'running'];

async function tableExists(db, name) {
  return Boolean(await db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", name));
}

function workerIds(assignments) {
  return [...new Set((Array.isArray(assignments) ? assignments : [])
    .map((worker) => worker?.agentId || worker?.workerId || worker?.id)
    .filter((id) => typeof id === 'string' && id.length > 0))];
}

function activeLease(row, now) {
  if (!row.queue_status || !ACTIVE_QUEUE.includes(row.queue_status)) return false;
  const expires = Date.parse(row.lease_expires_at || '');
  return row.queue_status === 'running' && row.queue_phase === 'ready'
    && typeof row.lease_id === 'string' && Number.isFinite(expires) && expires > now;
}

function observation(row, now) {
  const status = String(row.status || '').toLowerCase();
  const observed = row.queue_status || null;
  if (!workerRunnable(row, status)) {
    return { instanceId: row.id, status: 'unavailable', reason: 'worker_not_runnable', observedQueueStatus: observed };
  }
  if (workerBusy(row, status, now)) {
    return { instanceId: row.id, status: 'busy', reason: 'worker_or_lease_active', observedQueueStatus: observed };
  }
  if (status === 'idle' && !observed) {
    return { instanceId: row.id, status: 'idle_observed', reason: 'database_status_only', observedQueueStatus: null };
  }
  return { instanceId: row.id, status: 'unknown', reason: 'runtime_state_not_proven', observedQueueStatus: observed };
}

function workerRunnable(row, status) {
  return row.execution_mode === 'worker' && !['terminated', 'error', 'apoptosis'].includes(status);
}

function workerBusy(row, status, now) {
  return status === 'running' || activeLease(row, now) || isTransitioning(row.queue_phase);
}

function isTransitioning(phase) {
  return ['freezing', 'freeze_failed', 'frozen', 'thawing', 'cancelling'].includes(phase);
}

async function readMissionWorkerRuntimeSnapshot(db, assignments, now = Date.now()) {
  const ids = workerIds(assignments);
  if (!db || !ids.length || !await tableExists(db, 'agents') || !await tableExists(db, 'garage_queue')) {
    return { status: 'unknown', observedAt: now, workers: [], reason: 'runtime_tables_or_instance_ids_missing' };
  }
  try {
    return await snapshotForIds(db, ids, now);
  } catch (_) {
    return { status: 'unknown', observedAt: now, workers: [], reason: 'runtime_observation_failed' };
  }
}

async function snapshotForIds(db, ids, now) {
  const marks = ids.map(() => '?').join(',');
  const rows = await db.all(`SELECT a.id, a.status, a.execution_mode, q.status AS queue_status,
    q.phase AS queue_phase, q.lease_id, q.lease_expires_at
    FROM agents a LEFT JOIN garage_queue q ON q.worker_id = a.id
      AND (q.status IN ('claimed', 'running') OR q.phase IN ('freezing', 'freeze_failed', 'frozen', 'thawing', 'cancelling'))
    WHERE a.id IN (${marks})`, ...ids);
  const byId = new Map();
  for (const row of rows) byId.set(row.id, [...(byId.get(row.id) || []), row]);
  const workers = ids.map((id) => byId.has(id) ? observationRows(byId.get(id), now)
    : { instanceId: id, status: 'unknown', reason: 'instance_not_found' });
  return {
    status: workers.every((worker) => worker.status === 'idle_observed') ? 'idle_observed'
      : workers.some((worker) => worker.status === 'busy' || worker.status === 'unavailable') ? 'constrained' : 'unknown',
    observedAt: now,
    workers,
    authority: 'genos_database_read_only',
    limitation: 'database_observation_does_not_prove_process_liveness_or_admission'
  };
}

function observationRows(rows, now) {
  if (rows.length > 1) return { instanceId: rows[0].id, status: 'unknown', reason: 'multiple_active_queue_rows' };
  return observation(rows[0], now);
}

module.exports = { readMissionWorkerRuntimeSnapshot };
