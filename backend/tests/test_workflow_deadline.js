const assert = require('node:assert/strict');
const jobWorker = require('../src/services/jobWorker');
const modelRouter = require('../src/services/modelRouter');
const originalGenerate = modelRouter.generate;
const originalDateNow = Date.now;
let now = 1000;
Date.now = () => now;
modelRouter.generate = async () => { now += 5; return { model: 'test', provider: 'test', text: 'ok' }; };
const db = {
  get: async (sql) => sql.includes('SELECT * FROM workflows') ? { id: 'wf', version: 1, status: 'published', metadata_json: JSON.stringify({ workflowTimeoutMs: 1 }), graph_json: JSON.stringify({ nodes: [{ id: 'model', kind: 'model', model: 'test' }], edges: [] }) } : { status: 'running' },
  run: async () => ({ changes: 1 })
};
(async () => {
  await assert.rejects(jobWorker.executeWorkflow(db, { id: 'run', workflow_id: 'wf', workflow_version: 1, input_json: '{}' }), /total deadline/);
  console.log('Workflow deadline checks passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => { Date.now = originalDateNow; modelRouter.generate = originalGenerate; });
