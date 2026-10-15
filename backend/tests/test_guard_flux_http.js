'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID, generateKeyPairSync, createHash } = require('node:crypto');

const token = randomUUID();
const scope = { organizationId: randomUUID(), projectId: randomUUID() };
const missionId = randomUUID();
const rustMissionId = randomUUID();
const cellId = randomUUID();

async function run() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-guard-flux-http-'));
  process.env.NODE_ENV = 'test';
  process.env.GENOS_DB_PATH = path.join(directory, 'guard-flux.db');
  process.env.GENOS_ADMIN_TOKEN = token;
  process.env.GENOS_ADMIN_PASSWORD = 'guard-flux-http-test';
  process.env.GENOS_DB_BACKUP_SKIP = '1';
  process.env.GENOS_DB_SCHEMA_MAINTENANCE = '0';
  process.env.GENOS_STUDIO_ROOT = directory;
  configureCliAuthority();
  const { getDatabase, closeDatabase } = require('../src/db');
  const cli = require('../src/services/genosCli');
  const calls = [];
  const receipts = new Map();
  cli.runGenos = async args => {
    calls.push(args);
    const key = args[args.indexOf('--idempotency-key') + 1];
    if (!receipts.has(key)) receipts.set(key, { mission_id: rustMissionId,
      cell_id: args[args.indexOf('--cell-id') + 1], idempotency_key: key,
      requested_flux: Number(args[args.indexOf('--requested-flux') + 1]), receipt_id: randomUUID(),
      tick: Number(args[args.indexOf('--tick') + 1]), accepted: true });
    return { ok: true, json: { execution_mode: 'backend-authorized',
      mission_authority: 'authenticated_backend_capability', authority_scope: {
        organization_id: scope.organizationId, project_id: scope.projectId, mission_id: missionId,
      }, receipt: receipts.get(key) } };
  };
  const db = await getDatabase();
  await seed(db);
  const { createApp } = require('../src/app');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  try {
    const port = server.address().port;
    const route = '/api/rust/guard-flux/apply';
    const body = { missionId, cellId, idempotencyKey: 'guard-replay-1', requestedFlux: 20, tick: 4 };
    const unauthorized = await request({ port, route, body, authenticated: false });
    assert.equal(unauthorized.status, 401, JSON.stringify(unauthorized.body));
    assert.equal(calls.length, 0, 'unauthenticated requests must not invoke the CLI');

    const unscoped = await request({ port, route, body, scoped: false });
    assert.equal(unscoped.status, 403, JSON.stringify(unscoped.body));
    assert.equal(calls.length, 0, 'requests without an explicit writable project scope must not invoke the CLI');

    const foreign = await request({ port, route, body: { ...body, missionId: randomUUID() } });
    assert.equal(foreign.status, 404, JSON.stringify(foreign.body));
    assert.equal(calls.length, 0, 'a mission outside the scoped project must not invoke the CLI');

    const unknownCell = await request({ port, route, body: { ...body, cellId: randomUUID() } });
    assert.equal(unknownCell.status, 409, JSON.stringify(unknownCell.body));
    assert.equal(calls.length, 0, 'an unregistered cell must not invoke the CLI');

    const staleTick = await request({ port, route, body: { ...body, tick: 3 } });
    assert.equal(staleTick.status, 409, JSON.stringify(staleTick.body));
    assert.equal(calls.length, 0, 'a stale tick must not invoke the CLI');

    const first = await request({ port, route, body });
    const replay = await request({ port, route, body });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.deepEqual(replay.body.rust.receipt, first.body.rust.receipt);
    assert.equal(calls.length, 2);
    assert.deepEqual(withoutAuthorityPath(calls[0]), withoutAuthorityPath(calls[1]));
    assert.equal(calls[0][0], 'guard-flux');
    assert.equal(calls[0][calls[0].indexOf('--cell-id') + 1], cellId);
    assert.ok(calls[0].includes('--authority-file'));
    assert.ok(!calls[0].includes('--experimental'));
    await assertAuthorityFileRemoved(calls[0]);
    await assertAuthorityFileRemoved(calls[1]);
    assert.equal(calls[0][calls[0].indexOf('--mission-id') + 1], rustMissionId);
    assert.equal(first.body.backendAuthorization.permission, 'experiment:run');
    assert.equal(first.body.rust.mission_authority, 'authenticated_backend_capability');
    assert.equal(first.body.rust.authority_scope.mission_id, missionId);

    cli.runGenos = async () => ({ ok: true, json: {
      execution_mode: 'experimental', mission_authority: 'unverified_cli_claim',
      receipt: { idempotency_key: 'different-key' }
    } });
    const mismatched = await request({ port, route, body: { ...body, idempotencyKey: 'expected-key' } });
    assert.equal(mismatched.status, 502, JSON.stringify(mismatched.body));

    cli.runGenos = async args => ({ ok: true, json: {
      execution_mode: 'experimental', mission_authority: 'unverified_cli_claim',
      receipt: { mission_id: rustMissionId, cell_id: randomUUID(), tick: 4,
        requested_flux: 20, idempotency_key: args[args.indexOf('--idempotency-key') + 1] }
    } });
    const wrongCell = await request({ port, route, body: { ...body, idempotencyKey: 'wrong-cell-receipt' } });
    assert.equal(wrongCell.status, 502, JSON.stringify(wrongCell.body));

    cli.runGenos = async () => ({ ok: false, stderr: 'guard journal unavailable' });
    const failed = await request({ port, route, body: { ...body, idempotencyKey: 'guard-failure' } });
    assert.equal(failed.status, 502, JSON.stringify(failed.body));
    assert.equal(failed.body.error.message, 'guard journal unavailable');
    console.log('Guard-flux HTTP authorization, scope, current tick, and CLI result checks: PASS');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await closeDatabase();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function withoutAuthorityPath(args) {
  const copy = [...args];
  copy[copy.indexOf('--authority-file') + 1] = '<unique-capability>';
  return copy;
}

async function assertAuthorityFileRemoved(args) {
  const authorityPath = path.join(process.env.GENOS_STUDIO_ROOT, args[args.indexOf('--authority-file') + 1]);
  await assert.rejects(fs.access(authorityPath));
}

function configureCliAuthority() {
  const pair = generateKeyPairSync('ed25519');
  const der = pair.publicKey.export({ type: 'spki', format: 'der' });
  const key = der.subarray(der.length - 32);
  const keyId = createHash('sha256').update(key).digest('hex').slice(0, 32);
  process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  process.env.GENOS_CLI_AUTHORITY_TRUST_JSON = JSON.stringify({ [keyId]: key.toString('hex') });
}

async function seed(db) {
  await db.run('INSERT INTO organizations (id, name) VALUES (?, ?)', scope.organizationId, 'Guard Flux Org');
  await db.run('INSERT INTO projects (id, organization_id, name) VALUES (?, ?, ?)', scope.projectId, scope.organizationId, 'Guard Flux Project');
  await db.run('INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, ?, ?, ?, ?)',
    'guard-workspace', 'Guard Workspace', os.tmpdir(), scope.organizationId, scope.projectId);
  await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id)
    VALUES (?, ?, 'coordinator', 'idle', 'orchestrator', ?)`, 'guard-agent', 'Guard Agent', 'guard-workspace');
  await db.run('INSERT INTO missions (mission_id, objective, orchestrator_agent_id) VALUES (?, ?, ?)',
    missionId, 'scoped guard flux', 'guard-agent');
  await db.run('INSERT INTO mission_agents (mission_id, agent_id, role) VALUES (?, ?, ?)', missionId, 'guard-agent', 'orchestrator');
  await db.run('INSERT INTO biological_execution_missions (mission_id, rust_mission_id) VALUES (?, ?)', missionId, rustMissionId);
  await db.exec(`CREATE TABLE IF NOT EXISTS rust_cell_registry (
    mission_id TEXT NOT NULL, cell_id TEXT NOT NULL, tick INTEGER NOT NULL, PRIMARY KEY (mission_id, cell_id)
  )`);
  await db.run('INSERT INTO rust_cell_registry (mission_id, cell_id, tick) VALUES (?, ?, ?)', missionId, cellId, 4);
}

async function request({ port, route, body, authenticated = true, scoped = true }) {
  const headers = { 'content-type': 'application/json' };
  if (scoped) Object.assign(headers, { 'x-organization-id': scope.organizationId, 'x-project-id': scope.projectId });
  if (authenticated) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`http://127.0.0.1:${port}${route}`, { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

run().catch(error => { console.error(error.stack || error.message); process.exit(1); });
