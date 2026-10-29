'use strict';

const TERMINAL_WORKER_STATUSES = new Set(['error', 'terminated', 'failed', 'apoptosis']);

function releasableClaimStatus(row, workerStatus, now) {
  const expired = (row.lease_expires_at && Date.parse(row.lease_expires_at) <= now)
    || (row.deadline_at && Date.parse(row.deadline_at) <= now);
  if (!workerStatus || TERMINAL_WORKER_STATUSES.has(workerStatus)) return expired ? 'expired' : 'failed';
  return workerStatus !== 'running' && workerStatus !== 'blocked' && expired ? 'expired' : null;
}

async function recoverAbandonedClaims(db) {
  if (!db) return 0;
  const rows = await db.all(`SELECT q.request_id, q.worker_id, a.status AS worker_status,
      q.lease_expires_at, q.deadline_at FROM garage_queue q
    LEFT JOIN agents a ON a.id = q.worker_id
    WHERE q.status IN ('queued','claimed','running')
      AND q.phase IN ('ready','awaiting_approval','freeze_failed')`);
  let released = 0;
  const now = Date.now();
  for (const row of rows) {
    const terminal = releasableClaimStatus(row, row.worker_status, now);
    if (!terminal) continue;
    const result = await db.run(`UPDATE garage_queue SET status = ?,
      error_text = 'worker_terminal_claim_released', updated_at = CURRENT_TIMESTAMP
      WHERE request_id = ? AND status IN ('queued','claimed','running')`, terminal, row.request_id);
    released += Number(result?.changes || 0);
  }
  return released;
}

module.exports = { releasableClaimStatus, recoverAbandonedClaims };
