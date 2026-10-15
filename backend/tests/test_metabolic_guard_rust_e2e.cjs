'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const token = randomUUID();
const scope = { organizationId: randomUUID(), projectId: randomUUID() };
const missionId = randomUUID();
const rustMissionId = randomUUID();

async function run() {
  const directory = await fs.mkdtemp(path.join(__dirname, '.metabolic-guard-e2e-'));
  const workspace = path.join(directory, 'rust-workspace');
  let server;
  let closeDatabase = async () => {};
  let completed = false;
  try {
    await fs.mkdir(workspace);
    process.env.NODE_ENV = 'test';
    process.env.GENOS_DB_PATH = path.join(directory, 'backend.db');
    process.env.GENOS_ADMIN_TOKEN = token;
    process.env.GENOS_ADMIN_PASSWORD = 'metabolic-guard-e2e-test';
    process.env.GENOS_DB_BACKUP_SKIP = '1';
    process.env.GENOS_DB_SCHEMA_MAINTENANCE = '0';
    process.env.GENOS_STUDIO_ROOT = workspace;

    const cargoTarget = process.env.CARGO_TARGET_DIR
      ? path.resolve(process.env.CARGO_TARGET_DIR) : path.resolve(__dirname, '../../target');
    const binary = path.join(cargoTarget, 'debug', process.platform === 'win32' ? 'genos.exe' : 'genos');
    process.env.GENOS_BIN = binary;
    const cli = require('../src/services/genosCli');
    assert.ok(await exists(binary), `compiled genos CLI not found: ${binary}`);
    initializeRustMission(binary, workspace);
    const snapshot = readPopulationSnapshot(workspace, rustMissionId);
    const cellId = snapshot.orchestrator_id;
    assert.ok(snapshot.active_cells.some(cell => cell.cell_id === cellId), 'orchestrator cell must be in the durable population');

    const { getDatabase, closeDatabase: closeDb } = require('../src/db');
    closeDatabase = closeDb;
    const db = await getDatabase();
    await seedBackend(db, cellId);
    const { createApp } = require('../src/app');
    server = createApp().listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const port = server.address().port;
    await assertMetabolicReplay(port, workspace, cellId);
    await assertGuardFluxReplay(port, workspace, cellId);
    await assertRealRefusals({ port, workspace, cellId });
    console.log('Backend → real Rust CLI metabolic pool and Guard Flux replay/refusal: PASS');
    completed = true;
  } finally {
    if (server && server.listening) {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
    await closeDatabase();
    if (completed) await fs.rm(directory, { recursive: true, force: true });
    else console.error(`E2E fixture retained for diagnosis: ${directory}`);
  }
}

function initializeRustMission(binary, workspace) {
  const env = { ...process.env, GENOS_STUDIO_ROOT: workspace };
  const stdout = execFileSync(binary, [
    'biological', '--tick', '--mission-id', rustMissionId, '--mission', 'backend-rust-pool-e2e',
  ], { cwd: workspace, env, encoding: 'utf8', windowsHide: true });
  assert.equal(JSON.parse(stdout).success, true, 'real Rust CLI must seed a durable mission population');
}

function readPopulationSnapshot(workspace, mission) {
  const receipt = readJournal(workspace, mission)
    .find(item => item.schema === 'genos.population-state/v1');
  assert.ok(receipt, 'journal must contain a population receipt');
  return receipt;
}

async function assertMetabolicReplay(port, workspace, cellId) {
  const body = { missionId, cellId, idempotencyKey: 'e2e-metabolic-1',
    operation: 'protein_synthesis', aminoAcids: 2, tick: 1 };
  const first = await request({ port, route: '/api/rust/metabolic-pool/consume', body });
  const replay = await request({ port, route: '/api/rust/metabolic-pool/consume', body });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.deepEqual(replay.body.rust.receipt, first.body.rust.receipt,
    'a fresh Rust CLI process must replay the original metabolic receipt');
  assert.equal(first.body.rust.mission_authority, 'unverified_cli_claim');
  const receipts = readJournal(workspace, rustMissionId);
  const matching = receipts.filter(item => item.idempotency_key === body.idempotencyKey);
  assert.equal(matching.length, 1, 'metabolic retry must not append a second operation snapshot');
  assert.equal(matching[0].metabolic_operation.accepted, true);
  assert.equal(matching[0].active_cells.find(cell => cell.cell_id === cellId).cell_state.metabolism.amino_acids,
    first.body.rust.receipt.amino_acids_after);
}

async function assertGuardFluxReplay(port, workspace, cellId) {
  const body = { missionId, cellId, idempotencyKey: 'e2e-guard-flux-1', requestedFlux: 20, tick: 1 };
  const first = await request({ port, route: '/api/rust/guard-flux/apply', body });
  const replay = await request({ port, route: '/api/rust/guard-flux/apply', body });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.deepEqual(replay.body.rust.receipt, first.body.rust.receipt,
    'a fresh Rust CLI process must replay the original guard-flux receipt');
  assert.equal(first.body.rust.receipt.accepted, true);
  assert.equal(first.body.rust.mission_authority, 'unverified_cli_claim');
  const matching = readJournal(workspace, rustMissionId)
    .filter(item => item.idempotency_key === body.idempotencyKey);
  assert.equal(matching.length, 1, 'guard-flux retry must not append a second operation snapshot');
  assert.equal(matching[0].guard_flux_operation.idempotency_key, body.idempotencyKey);
  assert.equal(matching[0].guard_flux_operation.cell_id, cellId);
  assert.ok(matching[0].guard_cell_state);
}

async function assertRealRefusals({ port, workspace, cellId }) {
  const journal = readJournal(workspace, rustMissionId);
  const guard = journal.find(item => item.idempotency_key === 'e2e-guard-flux-1').guard_flux_operation;
  const before = guard.amino_acids_after;
  const refused = await request({ port, route: '/api/rust/metabolic-pool/consume', body: {
    missionId, cellId, idempotencyKey: 'e2e-metabolic-insufficient', operation: 'protein_synthesis',
    aminoAcids: before + 1, tick: 1,
  } });
  assert.equal(refused.status, 200, JSON.stringify(refused.body));
  assert.equal(refused.body.rust.receipt.accepted, false);
  assert.equal(refused.body.rust.receipt.amino_acids_after, before);

  const drained = await request({ port, route: '/api/rust/metabolic-pool/consume', body: {
    missionId, cellId, idempotencyKey: 'e2e-metabolic-drain', operation: 'protein_synthesis',
    aminoAcids: before, tick: 1,
  } });
  assert.equal(drained.status, 200, JSON.stringify(drained.body));
  assert.equal(drained.body.rust.receipt.accepted, true);
  assert.equal(drained.body.rust.receipt.amino_acids_after, 0);

  const guardRefusal = await request({ port, route: '/api/rust/guard-flux/apply', body: {
    missionId, cellId, idempotencyKey: 'e2e-guard-no-pool', requestedFlux: 20, tick: 1,
  } });
  assert.equal(guardRefusal.status, 200, JSON.stringify(guardRefusal.body));
  assert.equal(guardRefusal.body.rust.receipt.accepted, false);
  assert.equal(guardRefusal.body.rust.receipt.amino_acids_after, 0);
  const receipts = readJournal(workspace, rustMissionId);
  assert.equal(receipts.filter(item => item.idempotency_key === 'e2e-metabolic-insufficient').length, 1);
  const refusedFlux = receipts.filter(item => item.idempotency_key === 'e2e-guard-no-pool');
  assert.equal(refusedFlux.length, 1);
  assert.match(refusedFlux[0].guard_flux_operation.refusal_reason, /backpressure/i);
}

async function request({ port, route, body }) {
  let response;
  try {
    response = await fetch(`http://127.0.0.1:${port}${route}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        'x-organization-id': scope.organizationId,
        'x-project-id': scope.projectId,
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new Error(`HTTP request failed for ${route}: ${error.cause?.code || error.message}`, { cause: error });
  }
  return { status: response.status, body: await response.json() };
}

async function seedBackend(db, cellId) {
  await db.run('INSERT INTO organizations (id, name) VALUES (?, ?)', scope.organizationId, 'Rust E2E Org');
  await db.run('INSERT INTO projects (id, organization_id, name) VALUES (?, ?, ?)',
    scope.projectId, scope.organizationId, 'Rust E2E Project');
  await db.run('INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, ?, ?, ?, ?)',
    'rust-e2e-workspace', 'Rust E2E Workspace', os.tmpdir(), scope.organizationId, scope.projectId);
  await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id)
    VALUES (?, ?, 'coordinator', 'idle', 'orchestrator', ?)`, 'rust-e2e-agent', 'Rust E2E Agent', 'rust-e2e-workspace');
  await db.run('INSERT INTO missions (mission_id, objective, orchestrator_agent_id) VALUES (?, ?, ?)',
    missionId, 'real Rust metabolic and Guard Flux E2E', 'rust-e2e-agent');
  await db.run('INSERT INTO mission_agents (mission_id, agent_id, role) VALUES (?, ?, ?)',
    missionId, 'rust-e2e-agent', 'orchestrator');
  await db.run('INSERT INTO biological_execution_missions (mission_id, rust_mission_id) VALUES (?, ?)',
    missionId, rustMissionId);
  await db.exec(`CREATE TABLE IF NOT EXISTS rust_cell_registry (
    mission_id TEXT NOT NULL, cell_id TEXT NOT NULL, tick INTEGER NOT NULL, PRIMARY KEY (mission_id, cell_id)
  )`);
  await db.run('INSERT INTO rust_cell_registry (mission_id, cell_id, tick) VALUES (?, ?, ?)', missionId, cellId, 1);
}

function readJournal(workspace, mission) {
  const content = fsSync.readFileSync(path.join(workspace, 'biological-receipts', `${mission}.jsonl`), 'utf8');
  return content.split(/\r?\n/).filter(Boolean).map(JSON.parse)
    .flatMap(batch => Array.isArray(batch.receipts) ? batch.receipts : [batch]);
}

async function exists(filename) {
  try { await fs.access(filename); return true; } catch { return false; }
}

const fsSync = require('node:fs');
run().catch(error => { console.error(error.stack || error.message); process.exit(1); });
