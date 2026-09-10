const telemetry = require('./telemetryObserver');

function isRetryableJobError(error = {}) {
  const text = `${error.code || ''} ${error.message || ''}`.toLowerCase();
  return error.retryable === true
    || /timeout|timed out|rate limit|429|econn|enotfound|eai_again|etimedout|socket|network|temporar|connection refused|stream[ _-]?closed|http2|reset|unavailable|5\d\d/.test(text);
}

function resolveMaxAttempts(job) {
  const configured = Number(job.max_attempts || 3);
  return Number.isFinite(configured) ? Math.max(1, Math.min(Math.floor(configured), 10)) : 3;
}

function resolvePreviousAttempts(job) {
  return Number.isFinite(Number(job.attempts)) ? Math.max(0, Math.floor(Number(job.attempts))) : 0;
}

function startRetryHeartbeat(db, table, job) {
  const heartbeat = setInterval(() => {
    db.run(`UPDATE ${table} SET claimed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'running' AND claim_token = ?`, job.id, job.claim_token).catch(() => {});
  }, 30_000);
  heartbeat.unref?.();
  return heartbeat;
}

async function scheduleJobRetry(db, table, context) {
  const { error, attempt, max, job } = context;
  telemetry.emitEvent({ eventType: 'JOB_RETRY_SCHEDULED', action: 'JOB_RETRY', detail: `Retry scheduled for ${table} job ${job.id}: ${error.message}`, severity: 'warning', payload: { table, jobId: job.id, attempt, maxAttempts: max } });
  const baseDelay = Math.min(30000, 250 * (2 ** (attempt - 1)));
  const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(baseDelay / 2)));
  const retryAt = new Date(Date.now() + baseDelay + jitter).toISOString();
  await db.run(`UPDATE ${table} SET status = 'queued', claimed_at = NULL, next_attempt_at = ? WHERE id = ? AND status = 'running' AND claim_token = ?`, retryAt, job.id, job.claim_token);
}

async function failJob(db, table, context) {
  const { error, attempt, max, job } = context;
  const status = error.code === 'WORKFLOW_CANCELLED' ? 'cancelled' : 'failed';
  const retryable = isRetryableJobError(error);
  const deadLetter = status === 'failed' && retryable && attempt >= max;
  await db.run(`UPDATE ${table} SET status = ?, error_json = ?, completed_at = CURRENT_TIMESTAMP, claimed_at = NULL, next_attempt_at = NULL WHERE id = ? AND status = 'running' AND claim_token = ?`, status, JSON.stringify({ message: error.message, code: error.code || null, attempts: attempt, retryable, deadLetter, cancelled: status === 'cancelled' }), job.id, job.claim_token);
  if (deadLetter) telemetry.emitEvent({ eventType: 'JOB_DEAD_LETTERED', action: 'JOB_DEAD_LETTER', detail: `${table} job ${job.id} exhausted its retry budget.`, severity: 'error', payload: { table, jobId: job.id, attempt, maxAttempts: max, error: error.message } });
  telemetry.emitEvent({ eventType: 'JOB_FAILED', action: 'JOB_FAIL', detail: `Failed ${table} job ${job.id}: ${error.message}`, severity: 'error', payload: { table, jobId: job.id, attempt, maxAttempts: max, retryable } });
}

async function handleAttemptError(db, table, context) {
  const { error, attempt, max, job } = context;
  if (error.code === 'MODEL_JOB_CANCELLED') {
    await db.run(`UPDATE ${table} SET status = 'cancelled', error_json = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'running' AND claim_token = ?`, JSON.stringify({ message: error.message, cancelled: true, attempts: attempt }), job.id, job.claim_token);
    return { scheduled: true };
  }
  if (error.code === 'EVALUATION_JOB_CANCELLED') {
    await db.run(`UPDATE ${table} SET status = 'cancelled', error_json = ?, completed_at = CURRENT_TIMESTAMP, claimed_at = NULL WHERE id = ? AND status = 'running' AND claim_token = ?`, JSON.stringify({ message: error.message, cancelled: true, attempts: attempt }), job.id, job.claim_token);
    return { scheduled: true };
  }
  if (attempt === max || !isRetryableJobError(error)) {
    await failJob(db, table, context);
    return { scheduled: false };
  }
  await scheduleJobRetry(db, table, context);
  return { scheduled: true };
}

async function withRetry(db, table, ...args) {
  const job = args[0];
  const executor = args[1];
  const max = resolveMaxAttempts(job);
  const previousAttempts = resolvePreviousAttempts(job);
  for (let attempt = Math.max(1, previousAttempts + 1); attempt <= max; attempt++) {
    await db.run(`UPDATE ${table} SET attempts = ? WHERE id = ?`, attempt, job.id);
    telemetry.emitEvent({ eventType: 'JOB_ATTEMPT_STARTED', action: 'JOB_ATTEMPT', detail: `Started attempt ${attempt}/${max} for ${table} job ${job.id}.`, payload: { table, jobId: job.id, attempt, maxAttempts: max } });
    const heartbeat = startRetryHeartbeat(db, table, job);
    try {
      await executor();
      telemetry.emitEvent({ eventType: 'JOB_COMPLETED', action: 'JOB_COMPLETE', detail: `Completed ${table} job ${job.id}.`, payload: { table, jobId: job.id, attempt } });
      return;
    } catch (error) {
      const outcome = await handleAttemptError(db, table, { job, attempt, max, error });
      if (outcome.scheduled) return;
    } finally {
      clearInterval(heartbeat);
    }
  }
}

module.exports = { withRetry, isRetryableJobError };
