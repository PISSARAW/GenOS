const assert = require('node:assert/strict');
const dbModule = require('../src/db');
const original = dbModule.getDatabase;
const calls = [];
let missingWorkflow = false;
dbModule.getDatabase = async () => ({
  get: async (sql, ...params) => { calls.push({ sql, params }); return missingWorkflow ? null : (sql.toLowerCase().includes('from workflows') ? { id: 'wf-1', version: 2 } : { status: 'queued', output_json: '{}', error_json: null }); },
  run: async () => ({ changes: 1 })
});

delete require.cache[require.resolve('../src/grpc_services/workflowService')];
delete require.cache[require.resolve('../src/grpc_services/mcpService')];
const service = require('../src/grpc_services/workflowService');
const mcpService = require('../src/grpc_services/mcpService');
const mcpExecutor = require('../src/services/mcpExecutor');
const response = () => new Promise((resolve) => service.StartWorkflow({ request: { workflow_name: 'wf', organization_id: 'org', project_id: 'proj' } }, (_, value) => resolve(value)));
(async () => {
  const result = await response();
  assert.equal(result.status, 'queued');
  assert.ok(calls[0].sql.includes('organization_id = ?'));
  assert.ok(calls[0].sql.includes('project_id = ?'));

  missingWorkflow = true;

  await new Promise((resolve) => {
    service.StartWorkflow({ request: { workflow_name: 'missing', organization_id: 'org', project_id: 'proj' } }, (err, value) => {
      assert.ok(err, 'missing workflow should return a gRPC error');
      assert.equal(err.code, 5, 'missing workflow should map to NOT_FOUND');
      assert.equal(value, undefined);
      resolve();
    });
  });
  missingWorkflow = false;

  const originalCallTool = mcpExecutor.callTool;
  mcpExecutor.callTool = async () => {
    throw Object.assign(new Error('Missing MCP tool'), { code: 'MCP_TOOL_NOT_FOUND', status: 'not_found' });
  };

  await new Promise((resolve) => {
    mcpService.CallTool({ request: { tool_name: 'missing-tool', arguments_json: '{}', timeout_ms: 1000 } }, (err, value) => {
      assert.ok(err, 'missing MCP tool should return a gRPC error');
      assert.equal(err.code, 5, 'missing MCP tool should map to NOT_FOUND');
      assert.equal(value, undefined);
      resolve();
    });
  });
  mcpExecutor.callTool = originalCallTool;

  await new Promise((resolve) => {
    service.GetWorkflowStatus({ request: { workflow_id: 'run', organization_id: '', project_id: '' } }, (err, value) => {
      assert.equal(err.code, 3);
      assert.equal(err.message, 'organization_id and project_id are required.');
      assert.equal(value, undefined);
      resolve();
    });
  });

  console.log('Workflow gRPC scope checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { dbModule.getDatabase = original; });
