const assert = require('node:assert/strict');
const jobWorker = require('../src/services/jobWorker');

const runUpdates = [];
const db = {
  async get(sql) {
    if (sql.includes('SELECT status FROM workflow_runs')) return { status: 'running' };
    if (sql.includes('workflow_versions')) {
      return {
        id: 'wf',
        name: 'versioned',
        status: 'published',
        version: 2,
        graph_json: JSON.stringify({ nodes: [{ id: 'current-v2', type: 'trigger' }], edges: [] }),
        version_graph_json: JSON.stringify({ nodes: [{ id: 'requested-v1', type: 'trigger' }], edges: [] }),
        metadata_json: '{}',
        version_metadata_json: '{}'
      };
    }
    throw new Error(`Unexpected query: ${sql}`);
  },
  async run(sql, ...params) {
    runUpdates.push({ sql, params });
    return { changes: 1 };
  }
};

(async () => {
  await jobWorker.executeWorkflow(db, {
    id: 'run-v1', workflow_id: 'wf', workflow_version: 1, input_json: '{}'
  });
  const completion = runUpdates.find((entry) => entry.sql.includes("SET status = ?, output_json"));
  assert.ok(completion, 'the workflow run must be completed');
  assert.match(completion.params[1], /requested-v1/);
  assert.doesNotMatch(completion.params[1], /current-v2/);
  console.log('Workflow version snapshots are executed immutably.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
