'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const grpc = require('@grpc/grpc-js');
const express = require('express');
const fixture = require('./helpers/memoryConsumerFixture.cjs');

function rpc(context, method, request) {
  const metadata = new grpc.Metadata();
  if (context.transport !== false) metadata.set('x-genos-grpc-key', process.env.GENOS_GRPC_SHARED_SECRET);
  if (context.token) metadata.set('x-access-key', context.token);
  return new Promise((resolve, reject) => context.client[method](request, metadata,
    (error, result) => error ? reject(error) : resolve(result)));
}

async function rest(context, scope) {
  const headers = { 'x-organization-id': scope.organization_id, 'x-project-id': scope.project_id };
  if (context.token) headers['x-access-key'] = context.token;
  const response = await fetch(`${context.url}/api/memory/search?q=qualprobe`, { headers });
  return { status: response.status, result: await response.json() };
}

async function reads(context, scope) {
  const request = { text: 'qualprobe', limit: 50, ...scope };
  await assert.rejects(rpc({ ...context, token: null }, 'SearchMemory', request), error => error.code === grpc.status.UNAUTHENTICATED);
  await assert.rejects(rpc({ ...context, transport: false }, 'SearchMemory', request), error => error.code === grpc.status.UNAUTHENTICATED);
  assert.equal((await rest({ ...context, token: null }, scope)).status, 401);
  assert.equal(context.trap.requests, 0);
  const http = await rest(context, scope);
  const wire = await rpc(context, 'SearchMemory', request);
  assert.equal(http.status, 200);
  assert.deepEqual(fixture.privateIds(http.result.allScoredExperiences), ['p1-consumer-own']);
  assert.deepEqual(fixture.privateIds(wire.results), ['p1-consumer-own']);
  assert.equal(wire.results.find(row => row.id === 'p1-consumer-own').content, 'qualprobe canary-own');
  const sibling = { ...scope, project_id: 'p1-consumer-sibling' };
  await assert.rejects(rpc(context, 'SearchMemory', { ...request, ...sibling }), error => error.code === grpc.status.PERMISSION_DENIED);
  assert.equal((await rest(context, sibling)).status, 403);
  await assert.rejects(rpc(context, 'SearchMemory', { text: 'qualprobe' }), error => error.code === grpc.status.INVALID_ARGUMENT);
}

async function revocation(context, db) {
  const before = context.trap.requests;
  const request = { text: 'qualprobe', limit: 50, ...context.scope };
  await db.run("DELETE FROM project_memberships WHERE principal_id='p1-consumer-operator'");
  await assert.rejects(rpc(context, 'SearchMemory', request), error => error.code === grpc.status.PERMISSION_DENIED);
  assert.equal((await rest(context, context.scope)).status, 403);
  await db.run("INSERT INTO project_memberships VALUES ('p1-consumer-operator','p1-consumer-own','member',CURRENT_TIMESTAMP)");
  await db.run("UPDATE access_keys SET is_active=0 WHERE id='p1-consumer-operator'");
  await assert.rejects(rpc(context, 'SearchMemory', request), error => error.code === grpc.status.UNAUTHENTICATED);
  assert.equal((await rest(context, context.scope)).status, 401);
  assert.equal(context.trap.requests, before);
}

async function writes(context, db) {
  const request = { ...context.scope, id: 'p1-consumer-written', content: 'qualprobe stored content', embedding: Array(768).fill(0.1) };
  const saved = await rpc(context, 'StoreMemory', request);
  assert.equal(saved.success, true);
  assert.equal(saved.memory_id, request.id);
  const row = await db.get('SELECT content,organization_id,project_id,created_by FROM genome_decisions WHERE id=?', request.id);
  assert.deepEqual(row, { content: request.content, organization_id: context.scope.organization_id,
    project_id: context.scope.project_id, created_by: 'p1-consumer-operator' });
  await assert.rejects(rpc(context, 'StoreMemory', { ...request, id: 'p1-consumer-foreign' }), error => error.code === grpc.status.PERMISSION_DENIED);
  assert.equal((await db.get("SELECT content FROM genome_decisions WHERE id='p1-consumer-foreign'")).content, 'qualprobe canary-foreign');
  await assert.rejects(rpc({ ...context, token: context.scope.viewer }, 'StoreMemory', request), error => error.code === grpc.status.PERMISSION_DENIED);
  await db.run("UPDATE projects SET status='archived' WHERE id='p1-consumer-own'");
  await assert.rejects(rpc(context, 'StoreMemory', request), error => error.code === grpc.status.FAILED_PRECONDITION);
  await db.run("UPDATE projects SET status='active' WHERE id='p1-consumer-own'");
}

async function inputAndFaults(context) {
  const before = context.trap.requests;
  const request = { ...context.scope, text: 'qualprobe' };
  for (const input of [{ ...request, limit: -1 }, { ...request, limit: 101 }, { ...request, vector: [0.1, 0.2] }]) {
    await assert.rejects(rpc(context, 'SearchMemory', input), error => error.code === grpc.status.INVALID_ARGUMENT);
  }
  await assert.rejects(rpc({ ...context, token: 'p1-consumer-operator' }, 'SearchMemory', request), error => error.code === grpc.status.UNAUTHENTICATED);
  assert.equal(context.trap.requests, before);
  const memory = require('../src/services/vectorMemoryService');
  const original = memory.searchMemory;
  memory.searchMemory = async () => { throw new Error('private backend detail'); };
  try {
    await assert.rejects(rpc(context, 'SearchMemory', request), error => error.code === grpc.status.INTERNAL && !error.message.includes('private backend detail'));
  } finally { memory.searchMemory = original; }
}

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'genos-p1-memory-consumers-'));
  process.env.GENOS_DISABLE_DOTENV = '1';
  process.env.NODE_ENV = 'test';
  process.env.GENOS_ADMIN_PASSWORD = 'isolated-memory-consumer-test-only';
  process.env.GENOS_EMBEDDING_PROVIDER = 'none';
  process.env.GENOS_DB_PATH = path.join(root, 'memory.db');
  process.env.GENOS_STUDIO_ROOT = path.join(root, 'studio');
  process.env.GENOS_GRPC_SHARED_SECRET = crypto.randomBytes(24).toString('hex');
  const store = require('../src/db');
  const server = new grpc.Server();
  const trap = await fixture.embeddingTrap();
  let client, http;
  try {
    const db = await store.getDatabase();
    const scope = await fixture.seed(db);
    const Memory = require('../proto')().memory.genos.memory.v1.MemoryService;
    server.addService(Memory.service, require('../src/grpc_services/grpcAuth').guardService(require('../src/grpc_services/memoryService')));
    const port = await new Promise((resolve, reject) => server.bindAsync('127.0.0.1:0',
      grpc.ServerCredentials.createInsecure(), (error, value) => error ? reject(error) : resolve(value)));
    client = new Memory(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
    const app = express();
    app.use(require('../src/middleware/auth').requireAuthentication);
    app.use('/api/memory', require('../src/routes/memoryRoutes'));
    app.use(require('../src/middleware/errorHandler').errorHandler);
    http = await new Promise(resolve => { const handle = app.listen(0, '127.0.0.1', () => resolve(handle)); });
    const context = { client, url: `http://127.0.0.1:${http.address().port}`, token: scope.operator, scope, trap };
    await reads(context, scope);
    await writes(context, db);
    await inputAndFaults(context);
    await revocation(context, db);
    console.log('Live REST/gRPC memory: same scoped data, authenticated principal, membership and key revocation qualified.');
  } finally {
    client?.close();
    server.forceShutdown();
    if (http) await new Promise(resolve => http.close(resolve));
    await store.closeDatabase();
    await trap.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
