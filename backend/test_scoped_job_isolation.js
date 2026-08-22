const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { getDatabase, closeDatabase } = require('./src/db');
const evals = require('./src/controllers/evalController');
const prompts = require('./src/controllers/promptController');

function response() {
  return {
    code: 200,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
    setHeader() {}, write() {}, end() {}
  };
}

async function call(handler, req) {
  const res = response();
  await handler(req, res, error => { throw error; });
  return res;
}

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-scoped-jobs-'));
  const db = await getDatabase(path.join(directory, 'jobs.db'));
  const suffix = crypto.randomUUID();
  const org = `org-${suffix}`;
  const projectA = `project-a-${suffix}`;
  const projectB = `project-b-${suffix}`;
  await db.run('INSERT INTO organizations(id,name) VALUES(?,?)', org, org);
  await db.run('INSERT INTO projects(id,organization_id,name) VALUES(?,?,?)', projectA, org, projectA);
  await db.run('INSERT INTO projects(id,organization_id,name) VALUES(?,?,?)', projectB, org, projectB);
  const tenantA = { organizationId: org, projectId: projectA };
  const tenantB = { organizationId: org, projectId: projectB };
  const job = await call(evals.createJob, { body: { config: { graders: ['exact_match'] } }, tenant: tenantA });
  assert.equal(job.code, 202);
  const visible = await call(evals.listJobs, { tenant: tenantA });
  assert.equal(visible.body.some(item => item.id === job.body.id), true);
  const hidden = await call(evals.listJobs, { tenant: tenantB });
  assert.equal(hidden.body.some(item => item.id === job.body.id), false);
  await db.run('INSERT INTO model_jobs(id,prompt,models_json,organization_id,project_id) VALUES(?,?,?,?,?)', 'job-private', 'secret', '[]', org, projectA);
  const stream = await call(prompts.streamJob, { params: { id: 'job-private' }, tenant: tenantB, on() {} });
  assert.equal(stream.code, 404);
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
  console.log('scoped job isolation checks passed');
}

main().catch(error => { console.error(error); process.exitCode = 1; });
