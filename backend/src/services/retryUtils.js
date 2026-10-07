function isRetryableJobError(error = {}) {
  const text = `${error.code || ''} ${error.message || ''}`.toLowerCase();
  return error.retryable === true || /timeout|timed out|rate limit|429|econn|enotfound|eai_again|etimedout|socket|network|temporar|connection refused|stream[ _-]?closed|http2|reset|unavailable|5\d\d/.test(text);
}

function calculateMaxAttempts(job) {
  const configuredMax = Number(job.max_attempts || 3);
  return Number.isFinite(configuredMax) ? Math.max(1, Math.min(Math.floor(configuredMax), 10)) : 3;
}

function calculatePreviousAttempts(job) {
  return Number.isFinite(Number(job.attempts)) ? Math.max(0, Math.floor(Number(job.attempts))) : 0;
}

function buildCancelUpdate(params) {
  const { table, error, attempt, jobId, extra = {} } = params;
  return { status: 'cancelled', errorJson: JSON.stringify({ message: error.message, cancelled: true, attempts: attempt, ...extra }), jobId, where: `id = ? AND status = 'running'` };
}

function buildFailureUpdate(params) {
  const { table, error, attempt, jobId, max, retryable } = params;
  const status = error.code === 'WORKFLOW_CANCELLED' ? 'cancelled' : 'failed';
  const deadLetter = status === 'failed' && retryable && attempt >= max;
  return {
    status,
    errorJson: JSON.stringify({ message: error.message, code: error.code || null, attempts: attempt, retryable, deadLetter, cancelled: status === 'cancelled' }),
    jobId,
    where: 'id = ?',
    deadLetter,
    retryable
  };
}

function buildRetryUpdate(params) {
  const { table, jobId, retryAt } = params;
  return { query: `UPDATE ${table} SET status = 'queued', claimed_at = NULL, next_attempt_at = ? WHERE id = ? AND status = 'running'`, params: [retryAt, jobId] };
}

async function emitJobEvent(params) {
  const { emit, eventType, action, detail, severity, payload } = params;
  emit({ eventType, action, detail, severity, payload });
}

async function withRetry(params) {
  const { db, table, job, executor } = params;
  const max = calculateMaxAttempts(job);
  const previousAttempts = calculatePreviousAttempts(job);
  const { emitEvent: emit } = require('./telemetryObserver.js');
  for (let attempt = Math.max(1, previousAttempts + 1); attempt <= max; attempt++) {
    await db.run(`UPDATE ${table} SET attempts = ? WHERE id = ?`, attempt, job.id);
    await emitJobEvent({ emit, eventType: 'JOB_ATTEMPT_STARTED', action: 'JOB_ATTEMPT', detail: `Started attempt ${attempt}/${max} for ${table} job ${job.id}.`, severity: 'info', payload: { table, jobId: job.id, attempt, maxAttempts: max } });
    const heartbeat = setInterval(() => { db.run(`UPDATE ${table} SET claimed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'running'`, job.id).catch(() => {}); }, 30_000);
    heartbeat.unref?.();
    try {
      await executor();
      await emitJobEvent({ emit, eventType: 'JOB_COMPLETED', action: 'JOB_COMPLETE', detail: `Completed ${table} job ${job.id}.`, severity: 'info', payload: { table, jobId: job.id, attempt } });
      return;
    } catch (error) {
      if (error.code === 'MODEL_JOB_CANCELLED') {
        const u = buildCancelUpdate({ table, error, attempt, jobId: job.id });
        await db.run(`UPDATE ${table} SET status = ?, error_json = ?, completed_at = CURRENT_TIMESTAMP WHERE ${u.where}`, u.status, u.errorJson, u.jobId);
        return;
      }
      if (error.code === 'EVALUATION_JOB_CANCELLED') {
        const u = buildCancelUpdate({ table, error, attempt, jobId: job.id, extra: { claimedAt: null } });
        await db.run(`UPDATE ${table} SET status = ?, error_json = ?, completed_at = CURRENT_TIMESTAMP, claimed_at = NULL WHERE ${u.where}`, u.status, u.errorJson, u.jobId);
        return;
      }
      const retryable = isRetryableJobError(error);
      if (attempt === max || !retryable) {
        const u = buildFailureUpdate({ table, error, attempt, jobId: job.id, max, retryable });
        await db.run(`UPDATE ${table} SET status = ?, error_json = ?, completed_at = CURRENT_TIMESTAMP, claimed_at = NULL, next_attempt_at = NULL WHERE ${u.where}`, u.status, u.errorJson, u.jobId);
        if (u.deadLetter) await emitJobEvent({ emit, eventType: 'JOB_DEAD_LETTERED', action: 'JOB_DEAD_LETTER', detail: `${table} job ${job.id} exhausted its retry budget.`, severity: 'error', payload: { table, jobId: job.id, attempt, maxAttempts: max, error: error.message } });
        await emitJobEvent({ emit, eventType: 'JOB_FAILED', action: 'JOB_FAIL', detail: `Failed ${table} job ${job.id}: ${error.message}`, severity: 'error', payload: { table, jobId: job.id, attempt, maxAttempts: max, retryable } });
      } else {
        await emitJobEvent({ emit, eventType: 'JOB_RETRY_SCHEDULED', action: 'JOB_RETRY', detail: `Retry scheduled for ${table} job ${job.id}: ${error.message}`, severity: 'warning', payload: { table, jobId: job.id, attempt, maxAttempts: max } });
        const baseDelay = Math.min(30000, 250 * (2 ** (attempt - 1)));
        const jitter = Math.floor(Math.random() * Math.max(1, Math.floor(baseDelay / 2)));
        const retryAt = new Date(Date.now() + baseDelay + jitter).toISOString();
        const u = buildRetryUpdate({ table, jobId: job.id, retryAt });
        await db.run(u.query, ...u.params);
        return;
      }
    } finally { clearInterval(heartbeat); }
  }
}

module.exports = { withRetry, isRetryableJobError, calculateMaxAttempts, calculatePreviousAttempts, buildCancelUpdate, buildFailureUpdate, buildRetryUpdate, emitJobEvent };