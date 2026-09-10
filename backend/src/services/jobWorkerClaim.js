const crypto = require('node:crypto');
const telemetry = require('./telemetryObserver');

async function claim(db, table, id) {
  const token = crypto.randomUUID();
  const started = table === 'workflow_runs' ? ', started_at = COALESCE(started_at, CURRENT_TIMESTAMP)' : '';
  const result = await db.run(`UPDATE ${table} SET status = 'running', claimed_at = CURRENT_TIMESTAMP, claim_token = ?${started} WHERE id = ? AND status = 'queued'`, token, id);
  if (result.changes === 1) telemetry.emitEvent({ eventType: 'JOB_CLAIMED', action: 'JOB_CLAIM', detail: `Claimed ${table} job ${id}.`, payload: { table, jobId: id } });
  return { claimed: result.changes === 1, token };
}

module.exports = { claim };
