'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const token = randomUUID();
const therapySecret = randomUUID();

function testEnv(database, workspace, missionId) {
  return { ...process.env, NODE_ENV: 'test', GENOS_DB_PATH: database,
    GENOS_ADMIN_TOKEN: token, GENOS_ADMIN_PASSWORD: 'clinical-http-test',
    GENOS_THERAPY_AUTH_SECRET: therapySecret, GENOS_DB_BACKUP_SKIP: '1',
    GENOS_DB_SCHEMA_MAINTENANCE: '0', CLINICAL_TEST_WORKSPACE: workspace,
    GENOS_STUDIO_ROOT: path.join(workspace, 'bridge'), TEST_CLINICAL_EXECUTOR_MARKER: path.join(workspace, 'rust-invoked.json'),
    CLINICAL_TEST_MISSION: missionId };
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
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try { await fs.access(file); return; } catch (_) { await new Promise(resolve => setTimeout(resolve, 10)); }
  }
  throw new Error(`Timed out waiting for ${path.basename(file)}`);
}

async function worker(mode, config) {
  Object.assign(process.env, testEnv(config.database, config.workspace, config.missionId));
  const cli = require('../src/services/genosCli');
  cli.runGenos = async (args) => {
    await fs.writeFile(process.env.TEST_CLINICAL_EXECUTOR_MARKER, JSON.stringify(args));
    await waitForFile(path.join(config.workspace, 'release-clinical-executor'));
    return { ok: true, exitCode: 0, json: { success: true, treatment_administered: true } };
  };
  const { createApp } = require('../src/app');
  const { closeDatabase } = require('../src/db');
  const server = createApp().listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  try {
    const port = server.address().port;
    if (mode === 'mutate') {
      const approved = await request({ port, scope: config.scope, method: 'POST',
        route: '/api/rust/clinical-authorizations', body: {
          missionId: config.missionId, cellId: config.cellId, therapy: 'IntensiveCareFluids', approved: true,
        },
      });
      assert.equal(approved.status, 201, JSON.stringify(approved.body));
      const authorizationId = approved.body.authorization.authorization_id;
      const foreign = await request({ port, scope: config.foreignScope, method: 'POST',
        route: `/api/rust/clinical-authorizations/${authorizationId}/revoke`, body: {}, });
      assert.equal(foreign.status, 404, 'a different tenant cannot revoke or discover the authorization');
      const applying = request({ port, scope: config.scope, method: 'POST',
        route: `/api/rust/clinical-authorizations/${authorizationId}/apply`,
        body: { missionId: config.missionId },
      });
      await waitForFile(process.env.TEST_CLINICAL_EXECUTOR_MARKER);
      let applied;
      try {
        const revoked = await request({ port, scope: config.scope, method: 'POST',
          route: `/api/rust/clinical-authorizations/${authorizationId}/revoke`, body: {},
        });
        assert.equal(revoked.status, 200, JSON.stringify(revoked.body));
        assert.equal(revoked.body.authorization.status, 'revoked_in_backend_ledger');
        assert.equal(revoked.body.authorization.offlineRustAuthorizationRevoked, false);
      } finally {
        await fs.writeFile(path.join(config.workspace, 'release-clinical-executor'), 'continue');
      }
      applied = await applying;
      assert.equal(applied.status, 200, JSON.stringify(applied.body));
      const invocation = await fs.readFile(process.env.TEST_CLINICAL_EXECUTOR_MARKER, 'utf8');
      const refused = await request({ port, scope: config.scope, method: 'POST',
        route: `/api/rust/clinical-authorizations/${authorizationId}/apply`, body: { missionId: config.missionId },
      });
      assert.equal(refused.status, 200, JSON.stringify(refused.body));
      assert.equal(refused.body.operation, 'clinical_apply');
      assert.equal(refused.body.authorizationId, authorizationId);
      assert.deepEqual(refused.body.rust, applied.body.rust,
        'a completed idempotent operation returns its stored result after later revocation');
      assert.equal(await fs.readFile(process.env.TEST_CLINICAL_EXECUTOR_MARKER, 'utf8'), invocation,
        'completed replay after revocation must not invoke Rust again');
      process.stdout.write(JSON.stringify({ authorizationId }));
      return;
    }
    const status = await request({ port, scope: config.scope, method: 'GET',
      route: `/api/rust/clinical-authorizations/${config.authorizationId}` });
    assert.equal(status.status, 200, JSON.stringify(status.body));
    assert.equal(status.body.authorization.status, 'revoked_in_backend_ledger');
    assert.equal(status.body.authorization.scope, 'backend_ledger_only');
    assert.equal(status.body.authorization.offlineRustAuthorizationRevoked, false);
    const foreign = await request({ port, scope: config.foreignScope, method: 'GET',
      route: `/api/rust/clinical-authorizations/${config.authorizationId}` });
    assert.equal(foreign.status, 404, 'tenant scope is applied again after process restart');
    process.stdout.write(JSON.stringify(status.body.authorization));
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await closeDatabase();
  }
}

function runWorker(mode, config) {
  const child = spawnSync(process.execPath, [__filename, '--worker', mode, encodeURIComponent(JSON.stringify(config))], {
    encoding: 'utf8', env: testEnv(config.database, config.workspace, config.missionId), timeout: 120000,
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
  return JSON.parse(child.stdout);
}

async function seedDatabase(config) {
  Object.assign(process.env, testEnv(config.database, config.workspace, config.missionId));
  const { getDatabase, closeDatabase } = require('../src/db');
  const db = await getDatabase(config.database);
  const { organizationId, projectId } = config.scope;
  await db.run('INSERT INTO organizations (id, name) VALUES (?, ?)', organizationId, 'Clinical Org');
  await db.run('INSERT INTO projects (id, organization_id, name) VALUES (?, ?, ?)', projectId, organizationId, 'Clinical Project');
  await db.run('INSERT INTO organizations (id, name) VALUES (?, ?)', config.foreignScope.organizationId, 'Other Clinical Org');
  await db.run('INSERT INTO projects (id, organization_id, name) VALUES (?, ?, ?)',
    config.foreignScope.projectId, config.foreignScope.organizationId, 'Other Clinical Project');
  await db.run('INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, ?, ?, ?, ?)',
    'clinical-workspace', 'Clinical Workspace', config.workspace, organizationId, projectId);
  await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id)
    VALUES (?, ?, 'coordinator', 'idle', 'orchestrator', ?)`, 'clinical-agent', 'Clinical Agent', 'clinical-workspace');
  await db.run('INSERT INTO missions (mission_id, objective, orchestrator_agent_id) VALUES (?, ?, ?)',
    config.missionId, 'tenant-scoped clinical authorization', 'clinical-agent');
  await db.run('INSERT INTO mission_agents (mission_id, agent_id, role) VALUES (?, ?, ?)',
    config.missionId, 'clinical-agent', 'orchestrator');
  await db.exec(`CREATE TABLE IF NOT EXISTS rust_cell_registry (
    mission_id TEXT NOT NULL, cell_id TEXT NOT NULL, genome_id TEXT, genome_fingerprint TEXT,
    cell_state_json TEXT NOT NULL, genome_state_json TEXT, source_receipt_id TEXT NOT NULL,
    tick INTEGER NOT NULL, PRIMARY KEY (mission_id, cell_id)
  )`);
  await db.run(`INSERT INTO rust_cell_registry
    (mission_id, cell_id, genome_id, genome_fingerprint, cell_state_json, source_receipt_id, tick)
    VALUES (?, ?, ?, ?, ?, ?, ?)`, config.missionId, config.cellId, randomUUID(), 'fingerprint-1', '{}', randomUUID(), 1);
  await closeDatabase();
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-clinical-http-restart-'));
  const config = {
    database: path.join(directory, 'clinical.db'), workspace: directory,
    missionId: randomUUID(), cellId: randomUUID(),
    scope: { organizationId: randomUUID(), projectId: randomUUID() },
    foreignScope: { organizationId: randomUUID(), projectId: randomUUID() },
  };
  try {
    await seedDatabase(config);
    const issuedAndRevoked = runWorker('mutate', config);
    const status = runWorker('inspect', { ...config, authorizationId: issuedAndRevoked.authorizationId });
    assert.equal(status.authorizationId, issuedAndRevoked.authorizationId);
    console.log('Tenant-scoped clinical authorization issue/revoke survives HTTP backend process restart: PASS');
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[2] === '--worker') {
  worker(process.argv[3], JSON.parse(decodeURIComponent(process.argv[4])))
    .catch(error => { console.error(error.stack || error.message, error.cause || ''); process.exit(1); });
} else {
  main().catch(error => { console.error(error.stack || error.message); process.exit(1); });
}
