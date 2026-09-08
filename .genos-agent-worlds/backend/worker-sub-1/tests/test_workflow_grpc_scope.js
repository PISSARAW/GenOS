const assert = require('node:assert/strict');
const original = require('../src/db').getDatabase;
const calls = [];
require('../src/db').getDatabase = async () => ({
  get: async (sql, ...params) => { calls.push({ sql, params }); return sql.toLowerCase().includes('from workflows') ? { id: 'wf-1', version: 2 } : { status: 'queued', output_json: '{}', error_json: null }; },
  run: async () => ({ changes: 1 })
});
const service = require('../src/grpc_services/workflowService');
const response = () => new Promise((resolve) => service.StartWorkflow({ request: { workflow_name: 'wf', organization_id: 'org', project_id: 'proj' } }, (_, value) => resolve(value)));
(async () => {
  const result = await response();
  assert.equal(result.status, 'queued');
  assert.ok(calls[0].sql.includes('organization_id = ?'));
  assert.ok(calls[0].sql.includes('project_id = ?'));
  await new Promise((resolve) => service.GetWorkflowStatus({ request: { workflow_id: 'run', organization_id: '', project_id: '' } }, (_, value) => { assert.equal(value.status, 'error'); resolve(); }));
  console.log('Workflow gRPC scope checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { require('../src/db').getDatabase = original; });
