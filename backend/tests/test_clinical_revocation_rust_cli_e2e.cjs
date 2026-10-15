'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { execFileSync, fork, spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const root = path.resolve(__dirname, '..', '..');
const target = path.join(path.resolve(root, process.env.CARGO_TARGET_DIR || 'target'), 'debug');
const binary = path.join(target, process.platform === 'win32' ? 'genos.exe' : 'genos');
const bridge = path.join(target, 'examples', process.platform === 'win32' ? 'receipt_bridge.exe' : 'receipt_bridge');
const token = randomUUID();
const therapySecret = randomUUID();

function backendEnv(config) {
  return { ...process.env, NODE_ENV: 'test', GENOS_DB_PATH: config.database,
    GENOS_ADMIN_TOKEN: token, GENOS_ADMIN_PASSWORD: 'clinical-revocation-e2e',
    GENOS_THERAPY_AUTH_SECRET: therapySecret, GENOS_DB_BACKUP_SKIP: '1',
    GENOS_DB_SCHEMA_MAINTENANCE: '0', GENOS_DB_BOOTSTRAP_SKIP: '0',
    TEST_MISSION_ID: config.mission, TEST_WORKSPACE: config.workspace };
}

async function receive(child) {
  let timeout;
  let message;
  try {
    [message] = await Promise.race([
      once(child, 'message'),
      once(child, 'exit').then(([code]) => { throw new Error(`Backend exited before ready: ${code}`); }),
      new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Backend readiness timed out')), 20000); }),
    ]);
  } catch (error) {
    child.kill();
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (message.error) throw new Error(message.error);
  return message;
}

async function startBackend(config, label) {
  console.log(`Clinical revocation E2E: starting backend ${label}`);
  const env = backendEnv(config);
  if (label === 'B') env.GENOS_DB_BOOTSTRAP_SKIP = '1';
  const child = fork(require.resolve('./fixtures/receiptBackend.cjs'), [], {
    env, stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
  });
  console.log(`Clinical revocation E2E: backend ${label} process ${child.pid} spawned`);
  const ready = await receive(child);
  console.log(`Clinical revocation E2E: backend ${label} ready on ${ready.port}`);
  return { child, port: ready.port, label };
}

async function stopBackend(backend) {
  if (!backend || backend.child.exitCode !== null) return;
  const stopped = once(backend.child, 'exit');
  backend.child.send('stop');
  let timeout;
  try {
    await Promise.race([stopped, new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('Backend shutdown timed out')), 12000);
    })]);
  } catch (error) {
    backend.child.kill();
    await Promise.race([once(backend.child, 'exit'), new Promise(resolve => setTimeout(resolve, 2000))]);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function request(input) {
  const { backend, route, method, body } = input;
  const response = await fetch(`http://127.0.0.1:${backend.port}${route}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json',
      'x-organization-id': 'receipt-org', 'x-project-id': 'receipt-project' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  return { status: response.status, body: await response.json() };
}

function localReceiptBridge(config) {
  const childEnv = { ...process.env, GENOS_WORKSPACE_ROOT: config.workspace };
  for (const key of ['GENOS_BACKEND_URL', 'GENOS_RUST_RECEIPT_TOKEN', 'GENOS_RUST_RECEIPT_ORG_ID',
    'GENOS_RUST_RECEIPT_PROJECT_ID', 'GENOS_RUST_RECEIPT_SECRET']) delete childEnv[key];
  const output = execFileSync(bridge, [config.journal, config.mission], {
    cwd: config.workspace, env: childEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output.trim());
}

async function seedCell(input) {
  const { backend, config, cell, sourceReceiptId } = input;
  console.log('Clinical revocation E2E: seeding clinical cell in backend database');
  const response = once(backend.child, 'message');
  let killTimeout;
  let seedTimeout;
  killTimeout = setTimeout(() => backend.child.kill(), 10000);
  backend.child.send({ action: 'seed-clinical-cell', row: {
    missionId: config.mission, cellId: cell.cell_id, genomeId: cell.genome_id,
    genomeFingerprint: cell.genome_fingerprint, cellStateJson: cell.cell_state_json,
    genomeStateJson: JSON.stringify(cell.genome_state), sourceReceiptId, tick: config.tick,
  } });
  try {
    const [result] = await Promise.race([response, new Promise((_, reject) => {
      seedTimeout = setTimeout(() => reject(new Error('Clinical cell seed timed out')), 10000);
    })]);
    if (result.error) throw new Error(result.error);
    assert.equal(result.seeded, true, 'fixture backend must seed the clinical cell');
    console.log('Clinical revocation E2E: clinical cell seeded');
  } finally {
    clearTimeout(killTimeout);
    clearTimeout(seedTimeout);
  }
}

async function runCli(config, authFile, overrides = {}) {
  const environment = { ...process.env, GENOS_WORKSPACE_ROOT: config.workspace,
    NODE_ENV: 'test', GENOS_THERAPY_AUTH_SECRET: therapySecret, ...overrides };
  const args = ['biomimicry', 'therapy', '--agent-id', config.cellId,
    '--therapy-type', 'IntensiveCareFluids', '--journal', config.journal,
    '--authorization-file', authFile];
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: config.workspace, env: environment,
      stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.once('error', reject);
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Clinical CLI timed out: ${stderr}`));
    }, 15000);
    child.once('close', code => {
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

async function createValidationBarrier(backend) {
  let releaseResponse;
  let validationStarted;
  const waitForValidation = new Promise(resolve => { validationStarted = resolve; });
  const responseGate = new Promise(resolve => { releaseResponse = resolve; });
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const upstream = await fetch(`http://127.0.0.1:${backend.port}${request.url}`, {
      method: request.method,
      headers: { authorization: request.headers.authorization,
        'content-type': request.headers['content-type'],
        'x-organization-id': request.headers['x-organization-id'],
        'x-project-id': request.headers['x-project-id'] },
      body: Buffer.concat(chunks),
    });
    const body = await upstream.text();
    response.writeHead(upstream.status, { 'content-type': 'application/json' });
    const split = Math.max(1, Math.floor(body.length / 2));
    response.write(body.slice(0, split));
    validationStarted();
    await responseGate;
    response.end(body.slice(split));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    waitForValidation,
    release: releaseResponse,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

async function demonstrateRevocationInterleaving(input) {
  const { backend, revokeBackend, config, authorization } = input;
  const authFile = path.join(config.workspace, 'race-authorization.json');
  const raceJournal = path.join(config.workspace, 'race-receipts.jsonl');
  await fs.writeFile(authFile, JSON.stringify(authorization));
  await fs.copyFile(config.journal, raceJournal);
  const raceConfig = { ...config, journal: raceJournal };
  const barrier = await createValidationBarrier(backend);
  const before = await fs.readFile(raceJournal, 'utf8');
  const execution = runCli(raceConfig, authFile, {
    GENOS_CLINICAL_BACKEND_URL: barrier.url,
    GENOS_CLINICAL_AUTH_TOKEN: token,
    GENOS_CLINICAL_ORGANIZATION_ID: 'receipt-org',
    GENOS_CLINICAL_PROJECT_ID: 'receipt-project',
  });
  try {
    await barrier.waitForValidation;
    const revoked = await request({ backend: revokeBackend,
      route: `/api/rust/clinical-authorizations/${authorization.authorization_id}/revoke`, method: 'POST', body: {} });
    assert.equal(revoked.status, 200, JSON.stringify(revoked.body));
    barrier.release();
    const result = await execution;
    assert.equal(result.code, 0, result.stderr);
    const after = await fs.readFile(raceJournal, 'utf8');
    assert.notEqual(after, before, 'stale successful validation currently permits a Rust journal append');
    assert.match(after, /genos\.clinical-application\/v1/);
    console.log('Clinical race reproduced: revocation committed after validation response began and before Rust append');
  } finally {
    barrier.release();
    await barrier.close();
  }
}

async function ensureRefusedWithoutMutation(input) {
  const { config, authFile, env, expected } = input;
  const before = await fs.readFile(config.journal, 'utf8');
  const result = await runCli(config, authFile, env);
  assert.notEqual(result.code, 0, `CLI must fail closed: ${expected}`);
  assert.match(result.stderr, expected);
  assert.equal(await fs.readFile(config.journal, 'utf8'), before,
    'refusal must precede any journal mutation');
}

async function removeWorkspace(workspace) {
  await fs.rm(workspace, { recursive: true, force: true, maxRetries: 40, retryDelay: 250 });
}

async function main() {
  assert.ok(await fs.access(binary).then(() => true, () => false), 'build genos-cli before running this E2E');
  assert.ok(await fs.access(bridge).then(() => true, () => false), 'build receipt_bridge before running this E2E');
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-clinical-revocation-cli-'));
  const config = { workspace, database: path.join(workspace, 'backend.db'),
    mission: randomUUID(), journal: path.join(workspace, 'receipts.jsonl'), tick: 1 };
  let first;
  let second;
  try {
    localReceiptBridge(config);
    console.log('Clinical revocation E2E: local journal ready');
    const batches = (await fs.readFile(config.journal, 'utf8')).trim().split(/\r?\n/).map(line => {
      const entry = JSON.parse(line);
      return entry.receipts || [entry.receipt || entry];
    });
    const lines = batches.flat();
    const source = lines.find(item => item.schema === 'genos.population-state/v1'
      && item.mission_id === config.mission && item.receipt_id);
    assert.ok(source, 'journal must contain the durable source snapshot');
    const cell = source.active_cells.find(item => item.genome_id && item.genome_fingerprint);
    assert.ok(cell, 'local Rust snapshot must contain a complete genome-bound cell');
    config.cellId = cell.cell_id;
    config.tick = source.tick;
    first = await startBackend(config, 'A');
    await seedCell({ backend: first, config, cell, sourceReceiptId: source.receipt_id });
    second = await startBackend(config, 'B');
    console.log('Clinical revocation E2E: two backend processes ready');
    const issue = await request({ backend: first, route: '/api/rust/clinical-authorizations', method: 'POST', body: {
      missionId: config.mission, cellId: config.cellId, therapy: 'IntensiveCareFluids', approved: true,
    } });
    assert.equal(issue.status, 201, JSON.stringify(issue.body));
    console.log('Clinical revocation E2E: authorization issued');
    const authorization = issue.body.authorization;
    const authFile = path.join(workspace, 'authorization.json');
    await fs.writeFile(authFile, JSON.stringify(authorization));

    const online = await request({ backend: first,
      route: `/api/rust/clinical-authorizations/${authorization.authorization_id}/validate`, method: 'POST', body: {
        missionId: config.mission, cellId: config.cellId, signature: authorization.signature,
      } });
    assert.equal(online.status, 200, JSON.stringify(online.body));

    await ensureRefusedWithoutMutation({ config, authFile, env: {
      GENOS_CLINICAL_BACKEND_URL: '',
    }, expected: /GENOS_CLINICAL_BACKEND_URL required; offline clinical authorization is refused/ });
    await ensureRefusedWithoutMutation({ config, authFile, env: {
      GENOS_CLINICAL_BACKEND_URL: 'http://127.0.0.1:1',
      GENOS_CLINICAL_AUTH_TOKEN: token,
      GENOS_CLINICAL_ORGANIZATION_ID: 'receipt-org',
      GENOS_CLINICAL_PROJECT_ID: 'receipt-project',
    }, expected: /clinical revocation state unavailable/ });
    for (const backendUrl of ['http://example.com', 'http://user@127.0.0.1',
      'http://127.0.0.1#fragment']) {
      await ensureRefusedWithoutMutation({ config, authFile, env: {
        GENOS_CLINICAL_BACKEND_URL: backendUrl,
        GENOS_CLINICAL_AUTH_TOKEN: token,
        GENOS_CLINICAL_ORGANIZATION_ID: 'receipt-org',
        GENOS_CLINICAL_PROJECT_ID: 'receipt-project',
      }, expected: /clinical backend URL/ });
    }

    const raceIssue = await request({ backend: first, route: '/api/rust/clinical-authorizations', method: 'POST', body: {
      missionId: config.mission, cellId: config.cellId, therapy: 'IntensiveCareFluids', approved: true,
    } });
    assert.equal(raceIssue.status, 201, JSON.stringify(raceIssue.body));
    await demonstrateRevocationInterleaving({ backend: first, revokeBackend: second, config,
      authorization: raceIssue.body.authorization });

    const revoke = await request({ backend: second,
      route: `/api/rust/clinical-authorizations/${authorization.authorization_id}/revoke`, method: 'POST', body: {} });
    assert.equal(revoke.status, 200, JSON.stringify(revoke.body));
    assert.equal(revoke.body.authorization.status, 'revoked_in_backend_ledger');
    console.log('Clinical revocation E2E: authorization revoked by second process');
    await ensureRefusedWithoutMutation({ config, authFile, env: {
      GENOS_CLINICAL_BACKEND_URL: `http://127.0.0.1:${first.port}`,
      GENOS_CLINICAL_AUTH_TOKEN: token,
      GENOS_CLINICAL_ORGANIZATION_ID: 'receipt-org',
      GENOS_CLINICAL_PROJECT_ID: 'receipt-project',
    }, expected: /clinical authorization rejected by backend revocation state/ });
    console.log('Real Rust CLI: two-process revocation check, offline/missing state refusal before journal mutation: PASS');
  } finally {
    console.log('Clinical revocation E2E: stopping backends and removing fixture');
    await Promise.all([first, second].map(server => stopBackend(server)
      .catch(error => console.error(`Clinical backend cleanup: ${error.message}`))));
    await removeWorkspace(workspace);
  }
}

main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
