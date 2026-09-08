const assert = require('node:assert/strict');
const queries = [];
const original = require('../src/db').getDatabase;
require('../src/db').getDatabase = async () => ({
  all: async (sql, ...params) => { queries.push({ sql, params }); return []; }
});
const { listTraces, getTrace, replayTrace } = require('../src/controllers/traceController');
const req = { query: { limit: '5' }, params: { traceId: 'trace-1' }, tenant: { organizationId: 'org-1', projectId: 'project-1' } };
const res = { json() {}, status() { return this; } };
(async () => {
  await listTraces(req, res, (error) => { throw error; });
  await getTrace(req, res, (error) => { throw error; });
  await replayTrace(req, res, (error) => { throw error; });
  assert.equal(queries.length, 3);
  assert.ok(queries.every(({ sql }) => sql.includes('organization_id = ?') && sql.includes('project_id = ?')));
  console.log('Trace tenant scope checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { require('../src/db').getDatabase = original; });