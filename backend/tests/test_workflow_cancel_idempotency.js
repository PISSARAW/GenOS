const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const workflow = require('../src/controllers/workflowController');
const { getDatabase, closeDatabase } = require('../src/db');

function response() {
  return { code: 200, body: null, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}

async function invoke(req) {
  const res = response();
  await workflow.cancelRun(req, res, (error) => { throw error; });
  return res;
}

(async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-cancel-idempotency-'));
  const db = await getDatabase(path.join(directory, 'workflow.db'));
  const suffix = crypto.randomUUID();
  const organizationId = `org-${suffix}`;
  const projectId = `project-${suffix}`;
  const workflowId = `wf-${suffix}`;
  const runId = `run-${suffix}`;
  await db.run('INSERT INTO workflows(id,name,graph_json,organization_id,project_id,status) VALUES(?,?,?,?,?,?)', workflowId, 'cancel-test', '{"nodes":[{"id":"start","type":"trigger"}],"edges":[]}', organizationId, projectId, 'published');
  await db.run('INSERT INTO workflow_runs(id,workflow_id,workflow_version,organization_id,project_id,status) VALUES(?,?,?,?,?,?)', runId, workflowId, 1, organizationId, projectId, 'queued');
  const request = { params: { runId }, tenant: { organizationId, projectId } };
  const first = await invoke(request);
  const second = await invoke(request);
  assert.equal(first.code, 200);
  assert.equal(second.code, 200);
  assert.deepEqual(second.body, { id: runId, status: 'cancelled' });
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
  console.log('Workflow cancellation is idempotent.');
})().catch((error) => { console.error(error); process.exitCode = 1; });