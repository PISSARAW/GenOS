'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_ADMIN_PASSWORD ||= 'promotion-gci-e2e-test-only';
process.env.GENOS_ADMIN_TOKEN ||= 'promotion-gci-e2e-test-admin-token';
process.env.GENOS_GVX_LEDGER_HMAC_SECRET ||= require('node:crypto').randomBytes(32).toString('hex');
process.env.GENOS_PROMOTION_SECRET ||= require('node:crypto').randomBytes(32).toString('hex');
process.env.GENOS_EPISTEMIC_RECEIPT_SECRET ||= require('node:crypto').randomBytes(32).toString('hex');

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { requireAuthentication } = require('../src/middleware/auth');
const gciRoutes = require('../src/routes/capabilityInheritanceRoutes');
const { errorHandler } = require('../src/middleware/errorHandler');
const signatureService = require('../src/services/promotionSignatureService');
const { closeDatabase } = require('../src/db');
const { publishExport } = require('../src/services/capabilityInheritance/catalog/exportRegistryStore');
const { getAllConcepts } = require('../src/services/capabilityGraphService');
const descriptor = require('../../spec/gci/exports/promotion-gate-v1.json');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-gci-promotion-e2e-'));
  process.env.GENOS_DB_PATH = path.join(root, 'promotion.db');
  const server = createServer();
  try {
    const fixture = await prepareFixture(root);
    await publishExport({ db: fixture.db, descriptor, capabilityGraph: getAllConcepts() });
    await seedCredentials(fixture.db);
    await seedCapabilityPolicy(fixture.db);
    const address = await listen(server);
    const manifest = testManifest();
    await assertLifecycle(address, manifest);
    await assertInvocation(address, fixture);
    await assertAuthorizationBoundaries(address, fixture);
    console.log('GCI PROMOTION_GATE Linked HTTP end-to-end: ok');
  } finally {
    await closeServer(server);
    await closeDatabase();
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function createServer() {
  const app = express();
  app.use(express.json());
  app.use(requireAuthentication);
  app.use('/api/gci/v1', gciRoutes);
  app.use(errorHandler);
  return http.createServer(app);
}

async function prepareFixture(root) {
  return require('./helpers/consumerPromotionFixture.cjs').prepare(root, {
    organizationId: 'gci-e2e-org', projectId: 'gci-e2e-project'
  });
}

async function seedCredentials(db) {
  await addCredential({ db, id: 'gci-pilot', token: 'gci-pilot-token',
    permissions: ['gci:read', 'gci:link', 'gci:adopt', 'gci:invoke'] });
  await addCredential({ db, id: 'gci-ungranted', token: 'gci-ungranted-token',
    permissions: ['gci:read', 'gci:invoke'] });
  await addCredential({ db, id: 'gci-reader', token: 'gci-reader-token', permissions: ['gci:read'] });
}

async function addCredential(input) {
  const hash = crypto.createHash('sha256').update(input.token).digest('hex');
  await input.db.run(`INSERT INTO access_keys (id, key_hash, label, role, permissions)
    VALUES (?, ?, ?, 'node', ?)`, input.id, hash, input.id, JSON.stringify(input.permissions));
  await input.db.run(`INSERT INTO project_memberships (principal_id, project_id, role)
    VALUES (?, 'gci-e2e-project', 'member')`, input.id);
}

async function seedCapabilityPolicy(db) {
  const policy = { effect: 'allow', actions: ['workspace:write'],
    subjects: { ids: ['gci-pilot'] }, resources: { types: ['gci-capability'], ids: ['PROMOTION_GATE'] } };
  await db.run(`INSERT INTO iam_policies (id, name, policy_json, organization_id, project_id)
    VALUES (?, ?, ?, ?, ?)`, 'gci-pilot-promotion-policy', 'Test-only PROMOTION_GATE authority',
  JSON.stringify(policy), 'gci-e2e-org', 'gci-e2e-project');
}

function testManifest() {
  return { schema: 'genos.gci.project/v1', project: { id: 'gci-e2e-project', environment: 'morph-crypt-e2e' },
    provider: { id: 'morph-crypt' }, inherit: [{ capability: 'PROMOTION_GATE', version: '1.0.0',
      mode: 'linked', permissions: ['workspace:write'] }],
    updates: { policy: 'manual', require_independent_verification: true, auto_merge: false } };
}

async function assertLifecycle(address, manifest) {
  const resolved = await request({ address, route: '/resolve', token: 'gci-pilot-token', method: 'POST', body: { manifest } });
  assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
  assert.equal(resolved.body.lockfile.capabilities[0].implementationDigest, descriptor.implementationDigest);
  assert.deepEqual(resolved.body.lockfile.capabilities[0].effectiveAuthority, ['workspace:write']);
  const linked = await request({ address, route: '/projects/gci-e2e-project/link', token: 'gci-pilot-token',
    method: 'POST', body: { manifest, expectedRevision: 0 } });
  assert.equal(linked.status, 200, JSON.stringify(linked.body));
  const adopted = await request({ address, route: '/adoptions', token: 'gci-pilot-token', method: 'POST',
    body: { manifest, expectedBindingRevision: linked.body.revision, expectedInstallationRevision: 0 } });
  assert.equal(adopted.status, 200, JSON.stringify(adopted.body));
  assert.equal(adopted.body.lockfile.graphDigest, resolved.body.lockfile.graphDigest);
  const status = await request({ address, route: '/projects/gci-e2e-project', token: 'gci-pilot-token', method: 'GET' });
  assert.equal(status.status, 200, JSON.stringify(status.body));
  assert.equal(status.body.installations[0].status, 'active');
}

async function assertInvocation(address, fixture) {
  const timestamp = Date.now();
  const signerId = 'morph-crypt-test-reviewer';
  const proof = { ...fixture.options.humanApprovalReceipt, approverId: signerId };
  const args = { runId: fixture.run.id, signerId, timestamp, signature: signatureService.generateSignature({
    runId: fixture.run.id, timestamp, signerId, payloadHash: proof.payloadHash
  }), humanApprovalReceipt: proof, report: fixture.options.report };
  const response = await request({ address, route: '/projects/gci-e2e-project/invocations', token: 'gci-pilot-token',
    method: 'POST', body: { environment: 'morph-crypt-e2e', capabilityId: 'PROMOTION_GATE', args } });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.result.id, fixture.run.id);
  assert.equal(response.body.result.status, 'completed');
  assert.equal(response.body.result.epistemicState.promotable, false);
  assert.equal(response.body.receipt.schema, 'genos.gci.invocation-receipt/v1');
  assert.equal(response.body.receipt.implementationDigest, descriptor.implementationDigest);
  const row = await fixture.db.get(`SELECT event_json FROM gci_event_ledger WHERE event_type = 'capability_invoked'`);
  assert.equal(JSON.parse(row.event_json).id, response.body.receipt.id);
}

async function assertAuthorizationBoundaries(address, fixture) {
  const readOnly = await request({ address, route: '/projects/gci-e2e-project/invocations', token: 'gci-reader-token', method: 'POST', body: {} });
  assert.equal(readOnly.status, 403);
  const deniedArgs = { runId: fixture.run.id, signerId: 'reviewer', timestamp: Date.now(), signature: 'a'.repeat(64),
    humanApprovalReceipt: { approved: true, approvalId: 'approval-test', approverId: 'reviewer',
      approvedAt: new Date().toISOString(), payloadHash: 'b'.repeat(64) } };
  const ungranted = await request({ address, route: '/projects/gci-e2e-project/invocations', token: 'gci-ungranted-token',
    method: 'POST', body: { environment: 'morph-crypt-e2e', capabilityId: 'PROMOTION_GATE', args: deniedArgs } });
  assert.equal(ungranted.body.error.code, 'GCI_AUTHORITY_REVOKED');
  const foreignScope = await request({ address, route: '/projects/other-project/invocations', token: 'gci-pilot-token',
    method: 'POST', body: { headersProject: 'other-project', environment: 'morph-crypt-e2e',
      capabilityId: 'PROMOTION_GATE', args: {} } });
  assert.equal(foreignScope.status, 403);
}

async function request(input) {
  const projectId = input.body?.headersProject || 'gci-e2e-project';
  const payload = input.body && { ...input.body };
  if (payload) delete payload.headersProject;
  const response = await fetch(`http://127.0.0.1:${input.address.port}/api/gci/v1${input.route}`, {
    method: input.method, headers: { Authorization: `Bearer ${input.token}`, 'X-Organization-Id': 'gci-e2e-org',
      'X-Project-Id': projectId, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    ...(payload ? { body: JSON.stringify(payload) } : {})
  });
  return { status: response.status, body: await response.json() };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });
}

function closeServer(server) {
  if (!server.listening) return Promise.resolve();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

main().catch((error) => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
