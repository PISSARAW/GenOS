'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const token = randomUUID();
const scope = { organizationId: randomUUID(), projectId: randomUUID() };
const missionId = randomUUID();
const rustMissionId = randomUUID();
const cellId = randomUUID();

async function run() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-metabolic-http-'));
  process.env.NODE_ENV = 'test';
  process.env.GENOS_DB_PATH = path.join(directory, 'metabolic.db');
  process.env.GENOS_ADMIN_TOKEN = token;
  process.env.GENOS_ADMIN_PASSWORD = 'metabolic-http-test';
  process.env.GENOS_DB_BACKUP_SKIP = '1';
  process.env.GENOS_DB_SCHEMA_MAINTENANCE = '0';
  const { getDatabase, closeDatabase } = require('../src/db');
  const cli = require('../src/services/genosCli');
  const calls = [];
  const receipts = new Map();
  cli.runGenos = async args => {
    calls.push(args);
    const key = args[args.indexOf('--idempotency-key') + 1];
    const value = flag => args[args.indexOf(flag) + 1];
    const identity = { mission_id: value('--mission-id'), cell_id: value('--cell-id'),
      idempotency_key: key, operation: value('--operation'), amino_acids: Number(value('--amino-acids')),
      tick: Number(value('--tick')) };
    if (!receipts.has(key)) receipts.set(key, { mission_id: identity.mission_id, cell_id: identity.cell_id,
      operation: identity.operation, requested_amino_acids: identity.amino_acids, receipt_id: randomUUID(),
      amino_acids_consumed: identity.amino_acids });
    return { ok: true, json: { success: true, execution_mode: 'experimental',
      mission_authority: 'unverified_cli_claim', ...identity, receipt: receipts.get(key) } };
  };
  const db = await getDatabase();
  await seed(db);
  const { createApp } = require('../src/app');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  try {
    const port = server.address().port;
    const route = '/api/rust/metabolic-pool/consume';
    const requestBody = { missionId, cellId, idempotencyKey: 'http-replay-1',
      operation: 'protein_synthesis', aminoAcids: 2, tick: 4 };
    const unauthorized = await request({ port, route, body: requestBody, authenticated: false });
    assert.equal(unauthorized.status, 401, JSON.stringify(unauthorized.body));
    assert.equal(calls.length, 0, 'unauthenticated requests must not invoke the CLI');

    const foreignMission = await request({ port, route, body: { ...requestBody, missionId: randomUUID() } });
    assert.equal(foreignMission.status, 404, JSON.stringify(foreignMission.body));
    assert.equal(calls.length, 0, 'a mission outside the scoped project must not invoke the CLI');

    const staleTick = await request({ port, route, body: { ...requestBody, tick: 3 } });
    assert.equal(staleTick.status, 409, JSON.stringify(staleTick.body));
    assert.equal(calls.length, 0, 'stale mission state must not invoke the CLI');

    const first = await request({ port, route, body: requestBody });
    const replay = await request({ port, route, body: requestBody });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.deepEqual(replay.body.rust.receipt, first.body.rust.receipt,
      'the CLI durable idempotency receipt must survive an HTTP retry');
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], calls[1]);
    assert.equal(calls[0][0], 'metabolic-pool');
    assert.ok(calls[0].includes('--experimental'), 'the CLI remains explicitly experimental and unauthenticated');
    assert.equal(calls[0][calls[0].indexOf('--cell-id') + 1], cellId);
    assert.equal(first.body.backendAuthorization.permission, 'experiment:run');
    assert.equal(first.body.rust.mission_authority, 'unverified_cli_claim');
    assert.equal('idempotency_key' in first.body.rust.receipt, false);
    assert.equal('tick' in first.body.rust.receipt, false);
    cli.runGenos = async args => ({ ok: true, json: { success: true, execution_mode: 'experimental',
      mission_authority: 'unverified_cli_claim', mission_id: rustMissionId, cell_id: cellId,
      idempotency_key: 'wrong-operation-key', operation: 'other_operation', amino_acids: 2, tick: 4,
      receipt: { mission_id: rustMissionId, cell_id: cellId, operation: 'other_operation', requested_amino_acids: 2 } } });
    const mismatch = await request({ port, route, body: { ...requestBody, idempotencyKey: 'bad-receipt-identity' } });
    assert.equal(mismatch.status, 502, JSON.stringify(mismatch.body));
    console.log('Metabolic HTTP authorization, refusal, and idempotent replay: PASS');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await closeDatabase();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function seed(db) {
  await db.run('INSERT INTO organizations (id, name) VALUES (?, ?)', scope.organizationId, 'Metabolic Org');
  await db.run('INSERT INTO projects (id, organization_id, name) VALUES (?, ?, ?)', scope.projectId, scope.organizationId, 'Metabolic Project');
  await db.run('INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, ?, ?, ?, ?)',
    'metabolic-workspace', 'Metabolic Workspace', os.tmpdir(), scope.organizationId, scope.projectId);
  await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id)
    VALUES (?, ?, 'coordinator', 'idle', 'orchestrator', ?)`, 'metabolic-agent', 'Metabolic Agent', 'metabolic-workspace');
  await db.run('INSERT INTO missions (mission_id, objective, orchestrator_agent_id) VALUES (?, ?, ?)',
    missionId, 'scoped metabolic pool consumption', 'metabolic-agent');
  await db.run('INSERT INTO mission_agents (mission_id, agent_id, role) VALUES (?, ?, ?)', missionId, 'metabolic-agent', 'orchestrator');
  await db.run('INSERT INTO biological_execution_missions (mission_id, rust_mission_id) VALUES (?, ?)', missionId, rustMissionId);
  await db.exec(`CREATE TABLE IF NOT EXISTS rust_cell_registry (
    mission_id TEXT NOT NULL, cell_id TEXT NOT NULL, tick INTEGER NOT NULL, PRIMARY KEY (mission_id, cell_id)
  )`);
  await db.run('INSERT INTO rust_cell_registry (mission_id, cell_id, tick) VALUES (?, ?, ?)', missionId, cellId, 4);
}

async function request(input) {
  const headers = { 'content-type': 'application/json', 'x-organization-id': scope.organizationId, 'x-project-id': scope.projectId };
  if (input.authenticated !== false) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`http://127.0.0.1:${input.port}${input.route}`, {
    method: 'POST', headers, body: JSON.stringify(input.body),
  });
  return { status: response.status, body: await response.json() };
}

run().catch(error => { console.error(error.stack || error.message); process.exit(1); });
