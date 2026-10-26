'use strict';

process.env.GENOS_DISABLE_DOTENV = '1';
process.env.GENOS_ADMIN_PASSWORD ||= 'promotion-http-test-only';
process.env.GENOS_ADMIN_TOKEN ||= 'promotion-http-test-admin-token';
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
const deployRoutes = require('../src/routes/deployRoutes');
const gciRoutes = require('../src/routes/capabilityInheritanceRoutes');
const { errorHandler } = require('../src/middleware/errorHandler');
const signatureService = require('../src/services/promotionSignatureService');
const { closeDatabase } = require('../src/db');
const { publishExport } = require('../src/services/capabilityInheritance/catalog/exportRegistryStore');
const { getAllConcepts } = require('../src/services/capabilityGraphService');
const descriptor = require('../../spec/gci/exports/promotion-gate-v1.json');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-promotion-http-'));
  process.env.GENOS_DB_PATH = path.join(root, 'promotion.db');
  const server = createServer();
  try {
    const fixture = await require('./helpers/consumerPromotionFixture.cjs').prepare(root, {
      organizationId: 'promotion-http-org', projectId: 'promotion-http-project'
    });
    await publishExport({ db: fixture.db, descriptor, capabilityGraph: getAllConcepts() });
    await addCredential(fixture.db, { id: 'approval-operator', token: 'approval-operator-token',
      role: 'operator', permissions: ['workspace:write'], projectId: 'promotion-http-project' });
    await addCredential(fixture.db, { id: 'approval-viewer', token: 'approval-viewer-token',
      role: 'viewer', permissions: [], projectId: 'promotion-http-project' });
    await addCredential(fixture.db, { id: 'gci-reader', token: 'gci-reader-token',
      role: 'node', permissions: ['gci:read'], projectId: 'promotion-http-project' });
    const address = await listen(server);
    await assertGciCatalog(address);
    await assertPublicRefusals(address, fixture.run.id);
    const response = await approve(address, fixture);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(response.body.status, 'completed');
    assert.equal(response.body.epistemicState.promotable, false,
      'completion is not represented as independent verification');
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
  app.use('/api', deployRoutes);
  app.use(errorHandler);
  return http.createServer(app);
}

async function addCredential(db, credential) {
  const hash = crypto.createHash('sha256').update(credential.token).digest('hex');
  await db.run(`INSERT INTO access_keys (id, key_hash, label, role, permissions)
    VALUES (?, ?, ?, ?, ?)`, credential.id, hash, credential.id, credential.role,
  JSON.stringify(credential.permissions));
  await db.run(`INSERT INTO project_memberships (principal_id, project_id, role)
    VALUES (?, ?, 'member')`, credential.id, credential.projectId);
}

async function assertPublicRefusals(address, runId) {
  const anonymous = await fetch(endpoint(address, runId), { method: 'POST' });
  assert.equal(anonymous.status, 401);
  const viewer = await fetch(endpoint(address, runId), requestOptions('approval-viewer-token', {
    'X-Organization-Id': 'promotion-http-org', 'X-Project-Id': 'promotion-http-project'
  }));
  assert.equal(viewer.status, 403);
  const wrongProject = await fetch(endpoint(address, runId), requestOptions('approval-operator-token', {
    'X-Organization-Id': 'promotion-http-org', 'X-Project-Id': 'other-project'
  }));
  assert.equal(wrongProject.status, 403);
}

async function assertGciCatalog(address) {
  const response = await fetch(`http://127.0.0.1:${address.port}/api/gci/v1/capabilities`, {
    headers: { Authorization: 'Bearer gci-reader-token',
      'X-Organization-Id': 'promotion-http-org', 'X-Project-Id': 'promotion-http-project' }
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.capabilities.length, 1);
  assert.equal(body.capabilities[0].capabilityId, 'PROMOTION_GATE');
  assert.equal(body.capabilities[0].maturity, 'integrated');
  assert.equal(body.capabilities[0].implementationDigest, descriptor.implementationDigest);
}

async function approve(address, fixture) {
  const signerId = 'independent-reviewer';
  const payloadHash = fixture.options.humanApprovalReceipt.payloadHash;
  const timestamp = Date.now();
  const body = { report: fixture.options.report,
    humanApprovalReceipt: { ...fixture.options.humanApprovalReceipt, approverId: signerId },
    signerId, timestamp, signature: signatureService.generateSignature({
      runId: fixture.run.id, timestamp, signerId, payloadHash
    }) };
  const response = await fetch(endpoint(address, fixture.run.id), requestOptions('approval-operator-token', {
    'X-Organization-Id': 'promotion-http-org', 'X-Project-Id': 'promotion-http-project',
    'Content-Type': 'application/json'
  }, JSON.stringify(body)));
  return { status: response.status, body: await response.json() };
}

function requestOptions(token, headers, body) {
  return { method: 'POST', headers: { Authorization: `Bearer ${token}`, ...headers }, body };
}

function endpoint(address, runId) {
  return `http://127.0.0.1:${address.port}/api/execution-runs/${runId}/approve`;
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

main().then(() => console.log('Promotion approval HTTP contract: ok')).catch((error) => {
  process.stderr.write(`${error.stack}\n`);
  process.exitCode = 1;
});
