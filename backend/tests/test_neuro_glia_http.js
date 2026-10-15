'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { generateKeyPairSync, verify } = require('node:crypto');
const { signedClaims } = require('../src/services/neuroGliaBackendAuthority');

const token = randomUUID();
const scope = { organizationId: randomUUID(), projectId: randomUUID() };
const missionId = randomUUID();
const rustMissionId = randomUUID();
const producerId = randomUUID();
const eventId = randomUUID();

async function run() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-neuro-glia-http-'));
  const keyPair = generateKeyPairSync('ed25519');
  configureEnvironment(directory, keyPair);
  const { getDatabase, closeDatabase } = require('../src/db');
  const cli = require('../src/services/genosCli');
  const calls = [];
  cli.runGenos = async (args, options) => {
    calls.push({ args, options });
    const payloadPath = args[args.indexOf('--payload') + 1];
    const payload = JSON.parse(await fs.readFile(payloadPath, 'utf8'));
    const proofPath = args[args.indexOf('--backend-proof') + 1];
    const proof = JSON.parse(await fs.readFile(proofPath, 'utf8'));
    assert.equal(verify(null, Buffer.from(JSON.stringify(signedClaims(proof))), keyPair.publicKey, Buffer.from(proof.signatureHex, 'hex')), true);
    return { ok: true, json: { success: true, execution_mode: 'experimental', entry: {
      schema: 'genos.mission-neuro-glia-event/v1', mission_id: rustMissionId, event_id: eventId,
      event_type: args[args.indexOf('--event-type') + 1],
      idempotency_key: args[args.indexOf('--idempotency-key') + 1],
      tick: Number(args[args.indexOf('--tick') + 1]),
      source: { producer_id: args[args.indexOf('--producer-id') + 1], backend_authorization: proof }, payload,
    } } };
  };
  const db = await getDatabase();
  await seed(db);
  const { createApp } = require('../src/app');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  try {
    const port = server.address().port;
    const route = '/api/rust/neuro-glia/events';
    const body = { missionId, producerId, eventId, eventType: 'BIOLOGICAL_EXECUTION_RECEIPT',
      payload: { outcome: 'observed' }, payloadSha256: 'b'.repeat(64), tick: 5, idempotencyKey: 'event-http-5', signatureHex: 'a'.repeat(128) };
    const backendPrivateKey = process.env.GENOS_NEURO_GLIA_BACKEND_PRIVATE_KEY_PEM;
    delete process.env.GENOS_NEURO_GLIA_BACKEND_PRIVATE_KEY_PEM;
    const noBackendSigner = await request({ port, route, body });
    assert.equal(noBackendSigner.status, 503);
    assert.equal(calls.length, 0);
    process.env.GENOS_NEURO_GLIA_BACKEND_PRIVATE_KEY_PEM = backendPrivateKey;
    const unauthorized = await request({ port, route, body, authenticated: false });
    assert.equal(unauthorized.status, 401);
    assert.equal(calls.length, 0);
    const foreign = await request({ port, route, body: { ...body, missionId: randomUUID() } });
    assert.equal(foreign.status, 404);
    assert.equal(calls.length, 0);
    const malformed = await request({ port, route, body: { ...body, signatureHex: 'bad' } });
    assert.equal(malformed.status, 400);
    assert.equal(calls.length, 0);
    const response = await request({ port, route, body });
    assert.equal(response.status, 201, JSON.stringify(response.body));
    assert.equal(response.body.backendAuthorization.permission, 'experiment:run');
    assert.equal(response.body.backendAuthorization.projectId, scope.projectId);
    assert.equal(response.body.backendAuthorization.proof.principalId.length > 0, true);
    assert.equal(response.body.backendAuthorization.proof.organizationId, scope.organizationId);
    assert.equal(response.body.backendAuthorization.proof.projectId, scope.projectId);
    assert.equal(response.body.backendAuthorization.proof.missionId, rustMissionId);
    assert.equal(response.body.backendAuthorization.proof.eventId, eventId);
    assert.equal(response.body.rust.entry.mission_id, rustMissionId);
    assert.equal(calls.length, 1);
    assert.ok(calls[0].args.includes('--experimental'));
    assert.ok(!calls[0].args.includes('--authority-file'));
    assert.equal(calls[0].args[calls[0].args.indexOf('--mission-id') + 1], rustMissionId);
    assert.equal(calls[0].options.envOverrides.GENOS_NEURO_GLIA_TRUST_JSON, process.env.GENOS_NEURO_GLIA_TRUST_JSON);
    const scopedRoot = calls[0].options.root;
    assert.ok(scopedRoot.startsWith(path.join(directory, 'tenants')));
    console.log('Neuro-glia HTTP principal, project scope, and producer-proof relay: PASS');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await closeDatabase();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function configureEnvironment(directory, keyPair) {
  process.env.NODE_ENV = 'test';
  process.env.GENOS_DB_PATH = path.join(directory, 'neuro-glia.db');
  process.env.GENOS_ADMIN_TOKEN = token;
  process.env.GENOS_ADMIN_PASSWORD = 'neuro-glia-http-test';
  process.env.GENOS_DB_BACKUP_SKIP = '1';
  process.env.GENOS_DB_SCHEMA_MAINTENANCE = '0';
  process.env.GENOS_STUDIO_ROOT = directory;
  const publicKeyHex = keyPair.publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
  process.env.GENOS_NEURO_GLIA_BACKEND_AUTHORITY_ID = 'backend-test';
  process.env.GENOS_NEURO_GLIA_BACKEND_PRIVATE_KEY_PEM = keyPair.privateKey.export({ format: 'pem', type: 'pkcs8' });
  process.env.GENOS_NEURO_GLIA_TRUST_JSON = JSON.stringify({ schema: 'genos.neuro-glia-producer-trust/v1', producers: [
    { producer_id: producerId, public_key_hex: publicKeyHex },
  ], backend_authorities: [{ authority_id: 'backend-test', public_key_hex: publicKeyHex }] });
}

async function seed(db) {
  await db.run('INSERT INTO organizations (id, name) VALUES (?, ?)', scope.organizationId, 'Neuroglia Org');
  await db.run('INSERT INTO projects (id, organization_id, name) VALUES (?, ?, ?)', scope.projectId, scope.organizationId, 'Neuroglia Project');
  await db.run('INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, ?, ?, ?, ?)',
    'neuroglia-workspace', 'Neuroglia Workspace', os.tmpdir(), scope.organizationId, scope.projectId);
  await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id)
    VALUES (?, ?, 'coordinator', 'idle', 'orchestrator', ?)`, 'neuroglia-agent', 'Neuroglia Agent', 'neuroglia-workspace');
  await db.run('INSERT INTO missions (mission_id, objective, orchestrator_agent_id) VALUES (?, ?, ?)', missionId, 'neuroglia event bridge', 'neuroglia-agent');
  await db.run('INSERT INTO mission_agents (mission_id, agent_id, role) VALUES (?, ?, ?)', missionId, 'neuroglia-agent', 'orchestrator');
  await db.run('INSERT INTO biological_execution_missions (mission_id, rust_mission_id) VALUES (?, ?)', missionId, rustMissionId);
}

async function request(input) {
  const headers = { 'content-type': 'application/json', 'x-organization-id': scope.organizationId, 'x-project-id': scope.projectId };
  if (input.authenticated !== false) headers.authorization = `Bearer ${token}`;
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${input.port}${input.route}`, {
      method: 'POST', headers, body: JSON.stringify(input.body),
    });
  } catch (error) { throw new Error(`HTTP test request failed: ${error.cause?.code || error.message}`); }
  return { status: response.status, body: await response.json() };
}

run().catch(error => { console.error(error.stack || error.message); process.exit(1); });
