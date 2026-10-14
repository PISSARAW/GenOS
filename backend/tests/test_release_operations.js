const assert = require('assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.NODE_ENV = 'test';
process.env.GENOS_ADMIN_PASSWORD = process.env.GENOS_ADMIN_PASSWORD || `test-${crypto.randomBytes(16).toString('hex')}`;
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
const abConfig = { slo: config.slo, variants: [{ name: 'control' }, { name: 'candidate' }] };
assert.equal(decide([
  { variant: 'control', requests: 20, errors: 0, latency_ms_total: 1000 },
  { variant: 'candidate', requests: 0, errors: 0, latency_ms_total: 0 }
], abConfig, 'ab').status, 'paused', 'Control traffic cannot satisfy the candidate minimum sample');
assert.equal(decide([
  { variant: 'control', requests: 20, errors: 0, latency_ms_total: 1000 },
  { variant: 'candidate', requests: 20, errors: 0, latency_ms_total: 2000 }
], abConfig, 'ab').status, 'rolled_back', 'A/B rollout cannot promote when control beats candidate');
const reversedAbConfig = { slo: config.slo, variants: [{ name: 'candidate' }, { name: 'control' }] };
assert.equal(decide([
  { variant: 'candidate', requests: 20, errors: 0, latency_ms_total: 2000 },
  { variant: 'control', requests: 20, errors: 0, latency_ms_total: 1000 }
], reversedAbConfig, 'ab').status, 'rolled_back', 'Candidate identity is independent of variant order');

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
  await db.run('INSERT INTO workflow_versions(id,workflow_id,version,graph_json) VALUES(?,?,?,?)', `wfv-${workflowId}`, workflowId, 1, '{"nodes":[],"edges":[]}');
  const tenant = { organizationId, projectId };
  const missingVersion = await invoke(releases.create, { body: { workflowId, version: 2 }, tenant });
  assert.equal(missingVersion.code, 404);
  assert.equal(missingVersion.body.error.code, 'WORKFLOW_VERSION_NOT_FOUND');
  const create = await invoke(releases.create, { body: { workflowId }, tenant });
  assert.equal(create.code, 201);
  const duplicate = await invoke(releases.create, { body: { workflowId }, tenant });
  assert.equal(duplicate.code, 409);
  assert.equal(duplicate.body.error.code, 'RELEASE_ALREADY_EXISTS');
  const rollout = await invoke(releases.createRollout, { params: { id: create.body.id }, body: { strategy: 'ab', slo: config.slo }, tenant });
  assert.equal(rollout.code, 201);
  const ambiguousCandidate = await invoke(releases.createRollout, { params: { id: create.body.id },
    body: { strategy: 'ab', variants: [{ name: 'control', traffic: 50 }, { name: 'variant-b', traffic: 50 }], slo: config.slo }, tenant });
  assert.equal(ambiguousCandidate.code, 400);
  assert.equal(ambiguousCandidate.body.code, 'INVALID_CANDIDATE_VARIANT');
  const explicitCandidate = await invoke(releases.createRollout, { params: { id: create.body.id },
    body: { strategy: 'ab', candidateVariant: 'variant-b', variants: [{ name: 'variant-b', traffic: 50 }, { name: 'control', traffic: 50 }], slo: config.slo }, tenant });
  assert.equal(explicitCandidate.code, 201);
  assert.equal(explicitCandidate.body.candidateVariant, 'variant-b');
  for (const variant of ['control', 'candidate']) {
    const metric = await invoke(releases.recordRolloutMetric, { params: { rolloutId: rollout.body.id }, body: { variant, requests: 10, latencyMs: variant === 'candidate' ? 80 : 100, costUsd: 0.01 }, tenant });
    assert.equal(metric.code, 202);
  }
  const outcome = await invoke(releases.decideRollout, { params: { rolloutId: rollout.body.id }, tenant });
  assert.equal(outcome.body.status, 'promoted');
  assert.equal(outcome.body.selectedVariant, 'candidate');
  const lateMetric = await invoke(releases.recordRolloutMetric, { params: { rolloutId: rollout.body.id },
    body: { variant: 'candidate', requests: 100, latencyMs: 1 }, tenant });
  assert.equal(lateMetric.code, 409, 'Closed rollout must reject late metric writes');
  const repeatedDecision = await invoke(releases.decideRollout, { params: { rolloutId: rollout.body.id }, tenant });
  assert.equal(repeatedDecision.code, 409, 'A terminal rollout decision cannot be recomputed');
  const persistedRelease = await db.get('SELECT status, environment FROM releases WHERE id = ?', create.body.id);
  assert.equal(persistedRelease.status, 'active');
  assert.equal(persistedRelease.environment, 'production');

  await db.run('INSERT INTO workflow_versions(id,workflow_id,version,graph_json) VALUES(?,?,?,?)',
    `wfv-${workflowId}-2`, workflowId, 2, '{"nodes":[],"edges":[]}');
  const stagingRelease = await invoke(releases.create, { body: { workflowId, version: 2 }, tenant });
  const staged = await invoke(releases.promote, { params: { id: stagingRelease.body.id }, body: { environment: 'staging' }, tenant });
  assert.equal(staged.code, 200);
  const forced = await invoke(releases.promote, { params: { id: stagingRelease.body.id },
    body: { environment: 'production', force: true, overrideReason: 'Emergency release review bypass' },
    tenant, user: { keyId: 'release-admin', role: 'admin' } });
  assert.equal(forced.code, 200, JSON.stringify(forced.body));
  assert.ok(forced.body.overrideReceiptId);
  const overrideReceipt = await db.get('SELECT actor_id, reason FROM release_force_promotion_receipts WHERE id = ?', forced.body.overrideReceiptId);
  assert.equal(overrideReceipt.actor_id, 'release-admin');
  assert.equal(overrideReceipt.reason, 'Emergency release review bypass');
  await assert.rejects(db.run('UPDATE release_force_promotion_receipts SET reason = ? WHERE id = ?',
    'rewritten override reason', forced.body.overrideReceiptId), /append-only/);

  const report = await invoke(releases.chargeback, { tenant });
  assert.equal(report.body.totalCostUsd, 0.02);
  await closeDatabase();
  fs.rmSync(directory, { recursive: true, force: true });
}

e2e().then(() => console.log('release operations checks passed')).catch(error => { console.error(error); process.exitCode = 1; });
