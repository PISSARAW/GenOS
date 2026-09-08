const assert = require('node:assert/strict');
const { withRetry } = require('../src/services/jobWorker');

const updates = [];
const db = {
  async run(sql, ...args) {
    updates.push({ sql, args });
    return { changes: 1 };
  }
};

withRetry(db, 'model_jobs', { id: 'job-1', attempts: 2, max_attempts: 3 }, async () => {
  const error = new Error('permanent failure');
  error.retryable = false;
  throw error;
}).then(() => {
  const attemptUpdate = updates.find((entry) => entry.sql.includes('SET attempts = ?'));
  assert.equal(attemptUpdate.args[0], 3, 'retries must continue from the persisted attempt count');
  const failureUpdate = updates.find((entry) => entry.sql.includes("status = ?"));
  assert.equal(JSON.parse(failureUpdate.args[1]).attempts, 3);
  console.log('Job retry persistence checks passed.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});