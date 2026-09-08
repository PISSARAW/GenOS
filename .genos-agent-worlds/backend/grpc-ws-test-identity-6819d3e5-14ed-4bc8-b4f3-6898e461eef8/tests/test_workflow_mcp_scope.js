const assert = require('node:assert/strict');
const mcpExecutor = require('../src/services/mcpExecutor');

const original = mcpExecutor.execute;
let received;
mcpExecutor.execute = async (options) => { received = options; return { success: true, status: 'completed' }; };
const jobWorker = require('../src/services/jobWorker');
const graph = { nodes: [{ id: 'tool-1', type: 'tool', tool: 'genos_inspect' }], edges: [] };
const db = {
  get: async (sql) => {
    if (sql.includes('SELECT status FROM workflow_runs')) return { status: 'running' };
    if (sql.includes('FROM workflows')) return { id: 'wf-1', version: 1, status: 'staging', graph_json: JSON.stringify(graph), organization_id: 'org-a', project_id: 'project-a' };
    return null;
  },
  run: async () => ({ changes: 1 })
};
(async () => {
  await jobWorker.executeWorkflow(db, { id: 'run-1', workflow_id: 'wf-1', workflow_version: 1, organization_id: 'org-a', project_id: 'project-a', input_json: '{}' });
  assert.equal(received.organizationId, 'org-a');
  assert.equal(received.projectId, 'project-a');
  console.log('Workflow MCP tenant propagation checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { mcpExecutor.execute = original; });