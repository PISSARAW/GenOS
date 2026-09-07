const assert = require('node:assert/strict');
const jobWorker = require('../src/services/jobWorker');

const priorityRows = [
  { id: 'low-old', organization_id: 'org-a', project_id: 'project-a', priority: 0, created_at: '2026-09-07 00:00:00' },
  { id: 'high-new', organization_id: 'org-a', project_id: 'project-a', priority: 90, created_at: '2026-09-07 01:00:00' },
  { id: 'other', organization_id: 'org-b', project_id: 'project-b', priority: 0, created_at: '2026-09-07 02:00:00' }
];
assert.equal(jobWorker.selectFairWorkflow(priorityRows, 'scheduler-priority').id, 'high-new');

const updates = [];
const db = {
  run: async (sql, ...params) => { updates.push({ sql, params }); return { changes: 1 }; }
};
const started = Date.now();
jobWorker.withRetry(db, 'model_jobs', { id: 'retry-1', attempts: 0, max_attempts: 2 }, async () => {
  const error = new Error('temporary network failure');
  error.code = 'ECONNRESET';
  throw error;
}).then(() => {
  assert(Date.now() - started < 1000, 'retry scheduling must not block on backoff');
  const deferred = updates.find((entry) => entry.sql.includes("status = 'queued'") && entry.sql.includes('next_attempt_at'));
  assert.ok(deferred, 'retry must be requeued with next_attempt_at');
  console.log('Job scheduler priority and deferred retry checks passed.');
}).catch((error) => { console.error(error); process.exitCode = 1; });
