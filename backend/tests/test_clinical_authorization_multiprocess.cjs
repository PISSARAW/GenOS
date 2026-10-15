'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const token = randomUUID();
const therapySecret = randomUUID();

function testEnv(config) {
  return { ...process.env, NODE_ENV: 'test', GENOS_DB_PATH: config.database,
    GENOS_ADMIN_TOKEN: token, GENOS_ADMIN_PASSWORD: 'clinical-http-test',
    GENOS_THERAPY_AUTH_SECRET: therapySecret, GENOS_DB_BACKUP_SKIP: '1',
    GENOS_DB_SCHEMA_MAINTENANCE: '0', GENOS_DB_BOOTSTRAP_SKIP: config.skipBootstrap ? '1' : '0',
    GENOS_SQLITE_BUSY_TIMEOUT_MS: '30000', CLINICAL_TEST_WORKSPACE: config.workspace,
    GENOS_STUDIO_ROOT: path.join(config.workspace, 'bridge'),
    TEST_CLINICAL_EXECUTOR_MARKER: config.marker,
    TEST_CLINICAL_EXECUTOR_RELEASE: config.release };
}

async function seedDatabase(config) {
  Object.assign(process.env, testEnv(config));
  const { getDatabase, closeDatabase } = require('../src/db');
  const db = await getDatabase(config.database);
  for (const scope of [config.scope, config.foreignScope]) {
    await db.run('INSERT INTO organizations (id, name) VALUES (?, ?)', scope.organizationId, `Clinical Org ${scope.organizationId}`);
    await db.run('INSERT INTO projects (id, organization_id, name) VALUES (?, ?, ?)',
      scope.projectId, scope.organizationId, 'Clinical Project');
  }
  await db.run('INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, ?, ?, ?, ?)',
    'clinical-workspace', 'Clinical Workspace', config.workspace,
    config.scope.organizationId, config.scope.projectId);
  await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id)
    VALUES (?, ?, 'coordinator', 'idle', 'orchestrator', ?)`, 'clinical-agent', 'Clinical Agent', 'clinical-workspace');
  await db.run('INSERT INTO missions (mission_id, objective, orchestrator_agent_id) VALUES (?, ?, ?)',
    config.missionId, 'multi-process clinical authorization', 'clinical-agent');
  await db.run('INSERT INTO mission_agents (mission_id, agent_id, role) VALUES (?, ?, ?)',
    config.missionId, 'clinical-agent', 'orchestrator');
  await db.exec(`CREATE TABLE IF NOT EXISTS rust_cell_registry (
    mission_id TEXT NOT NULL, cell_id TEXT NOT NULL, genome_id TEXT, genome_fingerprint TEXT,
    cell_state_json TEXT NOT NULL, genome_state_json TEXT, source_receipt_id TEXT NOT NULL,
    tick INTEGER NOT NULL, PRIMARY KEY (mission_id, cell_id)
  )`);
  await db.run(`INSERT INTO rust_cell_registry
    (mission_id, cell_id, genome_id, genome_fingerprint, cell_state_json, source_receipt_id, tick)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, config.missionId, config.cellId, randomUUID(),
    'fingerprint-1', '{}', randomUUID(), 1);
  await closeDatabase();
}

async function request(input) {
  const response = await fetch(`http://127.0.0.1:${input.port}${input.route}`, {
    method: input.method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json',
      'x-organization-id': input.scope.organizationId, 'x-project-id': input.scope.projectId },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
  });
  return { status: response.status, body: await response.json() };
}

async function waitForFile(file) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try { await fs.access(file); return; } catch (_) { await new Promise(resolve => setTimeout(resolve, 10)); }
  }
  throw new Error(`Timed out waiting for ${path.basename(file)}`);
}

async function startServer(config) {
  const serverConfig = { ...config, skipBootstrap: true };
  const child = spawn(process.execPath, [__filename, '--server', encodeURIComponent(JSON.stringify(serverConfig))], {
    env: testEnv(serverConfig), stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const line = stdout.split(/\r?\n/).find(value => value.startsWith('CLINICAL_SERVER_READY '));
    if (line) return { child, port: Number(line.split(' ')[1]), stderr: () => stderr };
    if (child.exitCode !== null) throw new Error(`Clinical server exited early: ${stderr}`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  child.kill();
  throw new Error(`Timed out starting clinical server: ${stderr}`);
}

async function stopServer(server) {
  if (server.child.exitCode !== null) return;
  server.child.kill('SIGTERM');
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server shutdown timed out: ${server.stderr()}`)), 5000);
    server.child.once('exit', () => { clearTimeout(timeout); resolve(); });
  });
}

async function runScenario(config) {
  await seedDatabase(config);
  const serverA = await startServer(config);
  const serverB = await startServer(config);
  try {
    const issue = await request({ port: serverA.port, scope: config.scope, method: 'POST',
      route: '/api/rust/clinical-authorizations', body: {
        missionId: config.missionId, cellId: config.cellId, therapy: 'IntensiveCareFluids', approved: true,
      } });
    assert.equal(issue.status, 201, JSON.stringify(issue.body));
    const authorizationId = issue.body.authorization.authorization_id;
    const foreign = await request({ port: serverB.port, scope: config.foreignScope, method: 'GET',
      route: `/api/rust/clinical-authorizations/${authorizationId}` });
    assert.equal(foreign.status, 404, 'authorization lookup remains tenant scoped across processes');
    const wrongMission = await request({ port: serverB.port, scope: config.scope, method: 'POST',
      route: `/api/rust/clinical-authorizations/${authorizationId}/apply`, body: { missionId: randomUUID() } });
    assert.equal(wrongMission.status, 404, 'authorization lookup remains mission scoped across processes');
    const applying = request({ port: serverA.port, scope: config.scope, method: 'POST',
      route: `/api/rust/clinical-authorizations/${authorizationId}/apply`, body: { missionId: config.missionId } });
    await waitForFile(config.marker);
    let revokeSettled = false;
    const revoking = request({ port: serverB.port, scope: config.scope, method: 'POST',
      route: `/api/rust/clinical-authorizations/${authorizationId}/revoke`, body: {} })
      .then(result => { revokeSettled = true; return result; });
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(revokeSettled, false, 'SQLite transaction must serialize revocation across processes');
    await fs.writeFile(config.release, 'release');
    const applied = await applying;
    assert.equal(applied.status, 200, JSON.stringify(applied.body));
    const revoked = await revoking;
    assert.equal(revoked.status, 200, JSON.stringify(revoked.body));
    assert.equal(revoked.body.authorization.status, 'revoked_in_backend_ledger');
    const callsBeforeReplay = await fs.readFile(config.marker, 'utf8');
    for (const server of [serverA, serverB]) {
      const replay = await request({ port: server.port, scope: config.scope, method: 'POST',
        route: `/api/rust/clinical-authorizations/${authorizationId}/apply`, body: { missionId: config.missionId } });
      assert.equal(replay.status, 409, JSON.stringify(replay.body));
      assert.equal(replay.body.error.code, 'CLINICAL_AUTHORIZATION_REVOKED');
    }
    assert.equal(await fs.readFile(config.marker, 'utf8'), callsBeforeReplay,
      'post-revocation replays from either process must be refused before Rust');
    console.log('Clinical HTTP multi-process SQLite serialization, tenant/mission scope and pre-Rust replay refusal: PASS');
  } finally {
    await fs.writeFile(config.release, 'release').catch(() => {});
    await stopServer(serverA);
    await stopServer(serverB);
  }
}

async function serve(config) {
  Object.assign(process.env, testEnv(config));
  const cli = require('../src/services/genosCli');
  cli.runGenos = async args => {
    await fs.appendFile(process.env.TEST_CLINICAL_EXECUTOR_MARKER, `${JSON.stringify(args)}\n`);
    await waitForFile(process.env.TEST_CLINICAL_EXECUTOR_RELEASE);
    return { ok: true, exitCode: 0, json: { success: true, treatment_administered: true } };
  };
  const { createApp } = require('../src/app');
  const { closeDatabase } = require('../src/db');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  process.stdout.write(`CLINICAL_SERVER_READY ${server.address().port}\n`);
  process.on('SIGTERM', async () => {
    await new Promise(resolve => server.close(resolve));
    await closeDatabase();
    process.exit(0);
  });
}

async function main() {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-clinical-multiprocess-'));
  const config = { database: path.join(workspace, 'clinical.db'), workspace,
    missionId: randomUUID(), cellId: randomUUID(), marker: path.join(workspace, 'rust-invocations.jsonl'),
    release: path.join(workspace, 'release-rust'), scope: { organizationId: randomUUID(), projectId: randomUUID() },
    foreignScope: { organizationId: randomUUID(), projectId: randomUUID() } };
  try { await runScenario(config); }
  catch (error) { console.error('Clinical multi-process scenario failed:', error.stack || error.message); throw error; }
  finally { await removeWorkspace(workspace); }
}

async function removeWorkspace(workspace) {
  for (let attempt = 0; attempt < 10; attempt++) {
    try { await fs.rm(workspace, { recursive: true, force: true }); return; }
    catch (error) {
      if (attempt === 9) {
        console.error(`Could not remove temporary fixture ${workspace}: ${error.message}`);
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

if (process.argv[2] === '--server') {
  serve(JSON.parse(decodeURIComponent(process.argv[3])))
    .catch(error => { console.error(error.stack || error.message); process.exit(1); });
} else {
  main().catch(error => { console.error(error.stack || error.message); process.exit(1); });
}
