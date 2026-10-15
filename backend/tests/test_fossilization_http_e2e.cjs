'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { configureTestFossilSigner } = require('./helpers/fossilSigningKey');

const token = crypto.randomUUID();
const scope = { organizationId: crypto.randomUUID(), projectId: crypto.randomUUID() };
const foreignScope = { organizationId: crypto.randomUUID(), projectId: crypto.randomUUID() };
const lineageId = `http-fossil-${crypto.randomUUID()}`;
const sourceEventId = crypto.randomUUID();

async function run() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-fossil-http-'));
  configureEnvironment(path.join(directory, 'fossil.db'));
  configureTestFossilSigner();
  const database = require('../src/db');
  const db = await database.getDatabase();
  let server;
  try {
    await seed(db);
    const { createApp } = require('../src/app');
    server = createApp().listen(0, '127.0.0.1');
    await waitForServer(server);
    await exerciseHttp(server.address().port, db);
    process.stdout.write('Fossilization live REST HTTP, authorization, scope and excavation: PASS\n');
  } finally {
    await closeServer(server);
    await database.closeDatabase();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function configureEnvironment(dbPath) {
  Object.assign(process.env, { NODE_ENV: 'test', GENOS_DB_PATH: dbPath,
    GENOS_ADMIN_PASSWORD: 'fossil-http-e2e', GENOS_DB_BACKUP_SKIP: '1',
    GENOS_DB_SCHEMA_MAINTENANCE: '0', GENOS_FOSSIL_ARTIFACT: '0' });
}

async function seed(db) {
  const keyId = 'fossil-http-operator';
  const keyHash = crypto.createHash('sha256').update(token).digest('hex');
  await db.run('INSERT INTO access_keys (id, key_hash, label, role) VALUES (?, ?, ?, ?)',
    keyId, keyHash, 'fossil-http-operator', 'operator');
  await addProject(db, scope, 'Fossil HTTP project');
  await addProject(db, foreignScope, 'Foreign Fossil HTTP project');
  await db.run('INSERT INTO project_memberships (principal_id, project_id, role) VALUES (?, ?, ?)',
    keyId, scope.projectId, 'member');
  await db.run(`INSERT INTO telemetry_events
    (event_id, agent_id, event_type, action, detail, payload_json, organization_id, project_id)
    VALUES (?, ?, 'AGENT_TERMINATED', 'TERMINATE', 'terminal HTTP fixture', ?, ?, ?)`,
  sourceEventId, lineageId, JSON.stringify({ reason: 'terminal fixture' }), scope.organizationId, scope.projectId);
}

async function addProject(db, target, name) {
  await db.run('INSERT INTO organizations (id, name) VALUES (?, ?)', target.organizationId, `${name} org`);
  await db.run('INSERT INTO projects (id, organization_id, name) VALUES (?, ?, ?)',
    target.projectId, target.organizationId, name);
}

async function exerciseHttp(port, db) {
  const route = '/api/fossils';
  const headers = scopeHeaders(scope);
  const anonymous = await request({ port, route, headers: tenantHeaders(scope) });
  assert.equal(anonymous.status, 401, 'REST routes require authentication');
  const wrongScope = await request({ port, route, headers: scopeHeaders(foreignScope) });
  assert.equal(wrongScope.status, 403, 'operator cannot access an ungranted project');
  assert.equal(await fossilCount(db), 0, 'auth and scope refusals must happen before fossil persistence');

  const recorded = await request({ port, route, method: 'POST', headers, body: {
    lineage_id: lineageId, source_event_id: sourceEventId, reason: 'live HTTP fossil',
    organization_id: foreignScope.organizationId, project_id: foreignScope.projectId,
    hard_parts: ['terminal-event'], phenotype_markers: [{ shape: 'elongated' }],
  } });
  assert.equal(recorded.status, 201, JSON.stringify(recorded.body));
  assert.equal(recorded.body.fossil.organization_id, scope.organizationId,
    'HTTP scope must override caller-supplied organization');
  assert.equal(recorded.body.fossil.project_id, scope.projectId,
    'HTTP scope must override caller-supplied project');
  assert.equal(recorded.body.fossil.source_event_id, sourceEventId);
  assert.equal(recorded.body.fossil.attestation.algorithm, 'ed25519');

  const listed = await request({ port, route, headers });
  assert.equal(listed.status, 200, JSON.stringify(listed.body));
  assert.deepEqual(listed.body.fossils.map(item => item.fossil_id), [recorded.body.fossil.fossil_id]);
  const excavated = await request({ port, route: `${route}/${recorded.body.fossil.fossil_id}/excavate`,
    method: 'POST', headers });
  assert.equal(excavated.status, 200, JSON.stringify(excavated.body));
  assert.equal(excavated.body.integrity_verified, true);
  assert.equal(excavated.body.specimen.source_event_id, sourceEventId);
  const foreignRead = await request({ port, route: `${route}/${recorded.body.fossil.fossil_id}`,
    headers: scopeHeaders(foreignScope) });
  assert.equal(foreignRead.status, 403, 'fossil lookup must require a granted tenant scope');
  assert.equal(await fossilCount(db), 1);
}

function scopeHeaders(target) {
  return { ...tenantHeaders(target), authorization: `Bearer ${token}` };
}

function tenantHeaders(target) {
  return { 'content-type': 'application/json', 'x-organization-id': target.organizationId,
    'x-project-id': target.projectId };
}

async function request(input) {
  const response = await fetch(`http://127.0.0.1:${input.port}${input.route}`, {
    method: input.method || 'GET', headers: input.headers,
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
  return { status: response.status, body: await response.json() };
}

function waitForServer(server) {
  return new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
}

function closeServer(server) {
  if (!server) return Promise.resolve();
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

function fossilCount(db) {
  return db.get('SELECT COUNT(*) AS count FROM fossils').then(row => row.count);
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
