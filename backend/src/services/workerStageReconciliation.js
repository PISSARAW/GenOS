'use strict';

const FAILED = new Set(['error', 'failed', 'terminated', 'apoptosis', 'quarantined', 'unverified']);

function statusOf(row) {
  return String(row.status || '').toLowerCase();
}

function counts(input) {
  const { workers, rows, dispatchFailures, startedWorkers = 0 } = input;
  const byId = new Map(rows.map((row) => [row.id, statusOf(row)]));
  const failed = new Set(dispatchFailures);
  let completed = 0;
  let blocked = 0;
  for (const worker of workers) {
    const status = byId.get(worker.agentId);
    if (FAILED.has(status)) failed.add(worker.agentId);
    if (status === 'completed') completed += 1;
    if (status === 'blocked') blocked += 1;
  }
  const pending = Math.max(0, workers.length - completed - failed.size - blocked);
  return { startedWorkers, completedWorkers: completed, failedWorkers: failed.size,
    blockedWorkers: blocked, pendingWorkers: pending };
}

module.exports = { counts };
