const assert = require('node:assert/strict');
const { validateGraph } = require('../src/controllers/workflowController');
const { executeWorkflow } = require('../src/services/jobWorker');

async function main() {
  const graph = {
    nodes: [
      { id: 'trigger', type: 'trigger', when: 'false' },
      { id: 'child', type: 'action' }
    ],
    edges: [{ source: 'trigger', target: 'child' }]
  };
  assert.equal(validateGraph(graph).valid, true);

  const updates = [];
  const db = {
    async get(sql) {
      if (sql.includes('SELECT status FROM workflow_runs')) return { status: 'running' };
      if (sql.includes('FROM workflows')) return { id: 'wf-1', version: 1, status: 'staging', graph_json: JSON.stringify(graph) };
      throw new Error(`Unexpected db.get: ${sql}`);
    },
    async run(sql, ...args) {
      updates.push({ sql, args });
      return { changes: 1 };
    }
  };

  await executeWorkflow(db, { id: 'run-1', workflow_id: 'wf-1', workflow_version: 1, input_json: '{}' });
  const completion = updates.find((entry) => entry.sql.includes("SET status = ?, output_json"));
  assert.ok(completion, 'a conditionally skipped branch must still complete the workflow');
  const output = JSON.parse(completion.args[1]);
  assert.deepEqual(output.skippedNodes, ['trigger', 'child']);
  assert.equal(output.output.child.status, 'skipped');

  assert.equal(validateGraph({ nodes: [{ id: 'a' }], edges: [null] }).valid, false);
  assert.equal(validateGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ source: 'a', target: 'b' }, { source: 'a', target: 'b' }] }).valid, false);
  assert.equal(validateGraph({ nodes: [{ id: 'a' }], edges: [{ source: 'a', target: 'a' }] }).valid, false);

  let finalRead = false;
  const cancelledUpdates = [];
  const cancelledDb = {
    async get(sql) {
      if (sql.includes('SELECT status FROM workflow_runs')) {
        if (finalRead) return { status: 'cancelled' };
        finalRead = true;
        return { status: 'running' };
      }
      if (sql.includes('FROM workflows')) return { id: 'wf-1', version: 1, status: 'staging', graph_json: JSON.stringify(graph) };
      throw new Error(`Unexpected db.get: ${sql}`);
    },
    async run(sql, ...args) { cancelledUpdates.push({ sql, args }); return { changes: 1 }; }
  };
  await assert.rejects(
    executeWorkflow(cancelledDb, { id: 'run-cancelled', workflow_id: 'wf-1', workflow_version: 1, input_json: '{}' }),
    (error) => error.code === 'WORKFLOW_CANCELLED'
  );
  assert.equal(cancelledUpdates.some((entry) => entry.sql.includes("SET status = ?, output_json")), false, 'cancelled runs must not be completed');

  console.log('workflow/job contracts: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
