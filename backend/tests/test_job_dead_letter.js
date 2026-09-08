const assert = require('node:assert/strict');
const { withRetry } = require('../src/services/jobWorker');

const updates = [];
const db = {
  async run(sql, ...args) {
    updates.push({ sql, args });
    return { changes: 1 };
  }
};

(async () => {
  await withRetry(db, 'model_jobs', { id: 'job-dead-1', attempts: 0, max_attempts: 1 }, async () => {
    const error = new Error('provider temporarily unavailable');
    error.retryable = true;
    throw error;
  });
  const failure = updates.find((entry) => entry.sql.includes('error_json = ?'));
  const payload = JSON.parse(failure.args[1]);
  assert.equal(payload.deadLetter, true);
  assert.equal(payload.attempts, 1);
  assert.equal(failure.sql.includes('next_attempt_at = NULL'), true);
  console.log('Job dead-letter checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
