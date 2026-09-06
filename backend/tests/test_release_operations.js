const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { decide } = require('../src/controllers/releaseController');
const releases = require('../src/controllers/releaseController');
const { getDatabase, closeDatabase } = require('../src/db');

const config = { slo: { maxErrorRate: 0.02, maxAverageLatencyMs: 500, minRequests: 10 } };
const metrics = [
  { variant: 'stable', requests: 10, errors: 0, latency_ms_total: 1000 },
  { variant: 'canary', requests: 10, errors: 0, latency_ms_total: 800 }
];

assert.deepEqual(decide([], config).status, 'paused');
assert.equal(decide(metrics, config).status, 'promoted');
assert.equal(decide(metrics, config).selectedVariant, 'canary');
assert.equal(decide([{ variant: 'canary', requests: 10, errors: 1, latency_ms_total: 1000 }], config).status, 'rolled_back');

function response() {
  return {
    code: 200,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

async function invoke(handler, req) {
  const res = response();
  await handler(req, res, error => { throw error; });
  return res;
}

async function e2e() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-release-'));
  const db = await getDatabase(path.join(directory, 'release.db'));
  const suffix = crypto.randomUUID();
  const organizationId = `org-${suffix}`;
  const projectId = `project-${suffix}`;
  const workflowId = `workflow-${suffix}`;
  await db.run('INSERT INTO organizations(id,name) VALUES(?,?)', organizationId, organizationId);
  await db.run('INSERT INTO projects(id,organization_id,name) VALUES(?,?,?)', projectId, organizationId, projectId);
  await db.run('INSERT INTO workflows(id,name,graph_json,organization_id,project_id) VALUES(?,?,?,?,?)', workflowId, 'test', '{"nodes":[],"edges":[]}', organizationId, projectId);
  const tenant = { organizationId, projectId };
  const create = await invoke(releases.create, { body: { workflowId }, tenant });
  assert.equal(create.code, 201);
  const rollout = await invoke(releases.createRollout, { params: { id: create.body.id }, body: { strategy: 'ab', slo: config.slo }, tenant });
  assert.equal(rollout.code, 201);
  for (const variant of ['control', 'candidate']) {
    const metric = await invoke(releases.recordRolloutMetric, { params: { rolloutId: rollout.body.id }, body: { variant, requests: 10, latencyMs: variant === 'candidate' ? 80 : 100, costUsd: 0.01 }, tenant });
    assert.equal(metric.code, 202);
  }
  const outcome = await invoke(releases.decideRollout, { params: { rolloutId: rollout.body.id }, tenant });
  assert.equal(outcome.body.status, 'promoted');
  assert.equal(outcome.body.selectedVariant, 'candidate');
  const report = await invoke(releases.chargeback, { tenant });
  assert.equal(report.body.totalCostUsd, 0.02);
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}

e2e().then(() => console.log('release operations checks passed')).catch(error => { console.error(error); process.exitCode = 1; });
