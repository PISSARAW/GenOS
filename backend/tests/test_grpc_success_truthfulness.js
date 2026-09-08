const assert = require('node:assert/strict');
const grpc = require('@grpc/grpc-js');
const dbModule = require('../src/db');
const mcpExecutor = require('../src/services/mcpExecutor');

const originalDb = dbModule.getDatabase;
const originalCallTool = mcpExecutor.callTool;

(async () => {
  dbModule.getDatabase = async () => ({
    get: async (sql) => String(sql).toLowerCase().includes('from workflow_runs')
      ? { id: 'run-1', status: 'failed', output_json: '{}', error_json: 'boom' }
      : null
  });
  delete require.cache[require.resolve('../src/grpc_services/workflowService')];
  delete require.cache[require.resolve('../src/grpc_services/mcpService')];
  const workflow = require('../src/grpc_services/workflowService');
  const mcp = require('../src/grpc_services/mcpService');
  await new Promise((resolve, reject) => workflow.GetWorkflowStatus({ request: { workflow_id: 'run-1', organization_id: 'org', project_id: 'project' } }, (error, value) => {
    try { assert.equal(error, null); assert.equal(value.success, false); assert.equal(value.error_code, 'WORKFLOW_FAILED'); resolve(); } catch (e) { reject(e); }
  }));
  mcpExecutor.callTool = async () => ({ success: false, error: 'tool failed', code: 'MCP_TOOL_ERROR' });
  await new Promise((resolve, reject) => mcp.CallTool({ request: { tool_name: 'broken-tool', arguments_json: '{}' } }, (error, value) => {
    try { assert.equal(error.code, grpc.status.INTERNAL); assert.equal(value, undefined); resolve(); } catch (e) { reject(e); }
  }));
  dbModule.getDatabase = originalDb;
  mcpExecutor.callTool = originalCallTool;
  console.log('gRPC success responses reflect actual operation state.');
})().catch((error) => { dbModule.getDatabase = originalDb; mcpExecutor.callTool = originalCallTool; console.error(error); process.exitCode = 1; });