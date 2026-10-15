'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { fork } = require('node:child_process');
const { randomUUID, generateKeyPairSync, createHash, sign } = require('node:crypto');
const { digestStimulus, serializeSignal } = require('../src/services/syntheticSensoryIngestionService');

const token = randomUUID();
const organizationId = randomUUID();
const projectId = randomUUID();
const missionId = randomUUID();
const foreignOrganizationId = randomUUID();
const foreignProjectId = randomUUID();
const foreignMissionId = randomUUID();
const producerId = randomUUID();
const scope = { organizationId, projectId };
let lastSourceDigest = '';
let biologicalPause = null;
let biologicalTick = 0;
const realCliRuns = [];
const requireRealCli = process.argv.includes('--real-cli');

async function run() {
  const useRealCli = requireRealCli || process.env.GENOS_SENSORY_REAL_CLI === '1';
  if (useRealCli && (!process.env.GENOS_BIN || !(await fileExists(process.env.GENOS_BIN)))) {
    throw new Error('Real sensory CLI E2E requires GENOS_BIN to name an existing built genos executable.');
  }
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-sensory-ingest-'));
  const pair = generateKeyPairSync('ed25519');
  const backendPair = generateKeyPairSync('ed25519');
  const publicDer = pair.publicKey.export({ type: 'spki', format: 'der' });
  const publicKey = publicDer.subarray(publicDer.length - 32);
  const backendPublic = backendPair.publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  process.env.NODE_ENV = 'test';
  process.env.GENOS_DB_PATH = path.join(directory, 'sensory.db');
  process.env.GENOS_STUDIO_ROOT = path.join(directory, 'bridge');
  process.env.GENOS_ADMIN_TOKEN = token;
  process.env.GENOS_ADMIN_PASSWORD = 'sensory-ingest-test';
  process.env.GENOS_DB_BACKUP_SKIP = '1';
  process.env.GENOS_DB_SCHEMA_MAINTENANCE = '0';
  process.env.GENOS_SENSORY_TRUST_JSON = JSON.stringify({ schema: 'genos.synthetic-sensory-producer-trust/v1',
    producers: [{ producer_id: producerId, public_key_hex: publicKey.toString('hex') }] });
  process.env.GENOS_CLI_AUTHORITY_PRIVATE_KEY_PEM = backendPair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  process.env.GENOS_CLI_AUTHORITY_TRUST_JSON = JSON.stringify({
    [createHash('sha256').update(backendPublic).digest('hex').slice(0, 32)]: backendPublic.toString('hex'),
  });
  const { getDatabase, closeDatabase } = require('../src/db');
  const db = await getDatabase();
  await seed(db);
  const { createApp } = require('../src/app');
  const cli = require('../src/services/genosCli');
  const originalRunGenos = cli.runGenos;
  if (useRealCli) cli.runGenos = async (...args) => {
    const result = await originalRunGenos(...args);
    realCliRuns.push({ args: args[0], result });
    return result;
  };
  else cli.runGenos = fakeRustBridge;
  let server = createApp().listen(0, '127.0.0.1');
  let restartedBackend = null;
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  try {
    let port = server.address().port;
    const route = `/api/rust/missions/${missionId}/sensory-receipts`;
    const firstInput = envelope(pair.privateKey, 1, [0.2, 0.5, 0.9]);
    const unauthenticated = await request({ port, route, body: firstInput, authenticated: false });
    assert.equal(unauthenticated.status, 401, JSON.stringify(unauthenticated.body));
    const outsideProject = await request({ port, route: `/api/rust/missions/${randomUUID()}/sensory-receipts`, body: firstInput });
    assert.equal(outsideProject.status, 404, JSON.stringify(outsideProject.body));
    const foreignProjectMission = await request({ port, route: `/api/rust/missions/${foreignMissionId}/sensory-receipts`, body: firstInput });
    assert.equal(foreignProjectMission.status, 404, JSON.stringify(foreignProjectMission.body));
    assert.equal(await countReceipts(db), 0, 'authentication and tenant failures must happen before persistence');
    assert.equal(await countDispatches(db), 0, 'authentication and tenant failures must happen before PAF dispatch claims');

    const tampered = structuredClone(firstInput);
    tampered.signal.ambient_uv[2] = 0.8;
    const invalidSignature = await request({ port, route, body: tampered });
    assert.equal(invalidSignature.status, 400, JSON.stringify(invalidSignature.body));
    assert.equal(invalidSignature.body.error.code, 'SENSORY_PRODUCER_SIGNATURE_INVALID');
    assert.equal(await countReceipts(db), 0, 'invalid producer signatures must be rejected before persistence');
    assert.equal(await countDispatches(db), 0, 'invalid signatures must not create PAF dispatch claims');
    await assertJournalAbsent(missionId);

    const accepted = await request({ port, route, body: firstInput });
    assert.equal(accepted.status, 201, JSON.stringify({ body: accepted.body, rust: realCliRuns }));
    if (useRealCli) assertRealRustProof(accepted.body);
    const replayState = await replayAfterOptionalRestart({ useRealCli, server, port, route, body: firstInput,
      accepted: accepted.body, directory, db, missionId });
    server = replayState.server;
    restartedBackend = replayState.child;
    port = replayState.port;
    assert.equal(await countDispatches(db), 1, 'exact replay must reuse its single completed dispatch');
    assert.equal(await countReceipts(db), 1);

    const divergent = await request({ port, route, body: envelope(pair.privateKey, 1, [0.2, 0.5, 0.8]) });
    assert.equal(divergent.status, 409, JSON.stringify(divergent.body));
    const laterTick = await request({ port, route, body: envelope(pair.privateKey, 3, [0.4]) });
    assert.equal(laterTick.status, 201, JSON.stringify(laterTick.body));
    const stale = await request({ port, route, body: envelope(pair.privateKey, 2, [0.3]) });
    assert.equal(stale.status, 409, JSON.stringify(stale.body));
    assert.equal(stale.body.error.code, 'SENSORY_TICK_STALE');
    assert.equal(await countReceipts(db), 2, 'conflicting and stale ticks must not change the durable receipt set');
    assert.equal(await countDispatches(db), 2, 'conflicting and stale ticks must not create extra dispatches');
    await assertMockConcurrency({ useRealCli, db, port, route, privateKey: pair.privateKey });
    console.log(useRealCli
      ? 'HTTP → real Rust CLI → PAF import, signature, scope and divergent replay checks: PASS'
      : 'Synthetic sensory HTTP ingest, signature refusal, scope and replay checks (Rust CLI mocked): PASS');
  } finally {
    if (!useRealCli) cli.runGenos = originalRunGenos;
    await closeHttpServer(server);
    await stopRestartedBackend(restartedBackend);
    await closeDatabase();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

async function replayAfterOptionalRestart(input) {
  const journalPath = path.join(process.env.GENOS_STUDIO_ROOT, 'biological-receipts', `${input.missionId}.jsonl`);
  const journalBefore = input.useRealCli ? await fs.readFile(journalPath) : null;
  const active = input.useRealCli ? await restartBackend(input) : { server: input.server, port: input.port };
  const replay = await request({ port: active.port, route: input.route, body: input.body });
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.duplicate, true);
  assert.deepEqual(replay.body.rust, input.accepted.rust, 'exact replay must return the original Rust/PAF result');
  await assertReplayDidNotTick({ useRealCli: input.useRealCli, child: active.child, journalPath, journalBefore: journalBefore });
  assert.equal(await countDispatches(input.db), 1, 'exact replay must reuse its single completed dispatch');
  assert.equal(await countReceipts(input.db), 1);
  return active;
}

async function restartBackend(input) {
  await closeHttpServer(input.server);
  const logPath = path.join(input.directory, 'restarted-backend-cli.jsonl');
  await fs.writeFile(logPath, '');
  const child = await startRestartedBackend(logPath);
  return { server: null, child, port: child.port };
}

async function assertReplayDidNotTick(input) {
  if (!input.useRealCli) return;
  const lines = (await fs.readFile(input.child.logPath, 'utf8')).split('\n').filter(Boolean);
  assert.deepEqual(lines, [], 'replayed backend must not invoke the Rust CLI');
  assert.deepEqual(await fs.readFile(input.journalPath), input.journalBefore,
    'exact replay after backend restart must leave the Rust journal byte-identical');
}

function startRestartedBackend(logPath) {
  const helper = path.join(__dirname, 'helpers', 'sensoryBackendRestartChild.cjs');
  const child = fork(helper, [], { env: { ...process.env, SENSORY_CLI_INVOCATION_LOG: logPath }, silent: true });
  let stderr = '';
  child.stderr.on('data', data => { stderr += data.toString(); });
  return waitForRestartedBackend(child, logPath, () => stderr);
}

function waitForRestartedBackend(child, logPath, stderrOutput) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Backend restart timed out: ${stderrOutput()}`)), 15000);
    child.once('error', error => { clearTimeout(timeout); reject(error); });
    child.once('exit', code => {
      if (code !== 0) { clearTimeout(timeout); reject(new Error(`Backend restart exited ${code}: ${stderrOutput()}`)); }
    });
    child.once('message', message => {
      if (message?.ready !== true) return;
      clearTimeout(timeout);
      resolve({ child, logPath, port: message.port });
    });
  });
}

function stopRestartedBackend(state) {
  if (!state?.child) return Promise.resolve();
  return new Promise((resolve, reject) => {
    state.child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Restarted backend exited ${code}.`)));
    state.child.send({ type: 'close' });
  });
}

function closeHttpServer(server) {
  if (!server) return Promise.resolve();
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

async function assertMockConcurrency(input) {
  if (!input.useRealCli) await assertConcurrentDispatch(input);
}

async function assertConcurrentDispatch(input) {
  const started = deferred();
  const resume = deferred();
  biologicalPause = { started, resume };
  const body = envelope(input.privateKey, 4, [0.6]);
  const first = request({ port: input.port, route: input.route, body });
  try {
    await started.promise;
    const competing = await request({ port: input.port, route: input.route, body });
    assert.equal(competing.status, 503, JSON.stringify(competing.body));
    assert.equal(competing.body.error.code, 'SENSORY_PAF_CLAIM_BUSY');
  } finally {
    resume.resolve();
    biologicalPause = null;
  }
  const completed = await first;
  assert.equal(completed.status, 201, JSON.stringify(completed.body));
  assert.equal(await countDispatches(input.db), 3, 'a concurrent request must not create a second PAF dispatch');
  assert.equal(await countReceipts(input.db), 3, 'a concurrent exact delivery must share one sensory receipt');
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function assertRealRustProof(body) {
  assert.equal(body.rust?.import?.execution_mode, 'backend-authorized', JSON.stringify(body));
  assert.equal(body.rust?.import?.mission_authority, 'authenticated_backend_capability', JSON.stringify(body));
  const sourceDigest = body.rust.import.receipt?.source_digest;
  assert.ok(sourceDigest, 'Rust must return the durable imported sensory receipt digest');
  assert.equal(body.rust.paf?.schema, 'genos.instinct-paf-receipt/v1', JSON.stringify(body.rust));
  assert.ok(body.rust.paf.sensory_source_refs.some(source => source.source_digest === sourceDigest),
    'the PAF receipt must reference the imported source digest');
}

async function fileExists(file) {
  try { return (await fs.stat(file)).isFile(); }
  catch { return false; }
}

async function assertJournalAbsent(id) {
  const journal = path.join(process.env.GENOS_STUDIO_ROOT, 'biological-receipts', `${id}.jsonl`);
  await assert.rejects(fs.access(journal), { code: 'ENOENT' }, 'rejected requests must not create a Rust receipt journal');
}

async function fakeRustBridge(args) {
  if (args[0] === 'sensory-backend-import') {
    const authorityPath = path.join(process.env.GENOS_STUDIO_ROOT, args[2]);
    const envelope = JSON.parse(await fs.readFile(authorityPath, 'utf8'));
    const claims = envelope.claims;
    lastSourceDigest = claims.payload_hash;
    return { ok: true, json: { execution_mode: 'backend-authorized', mission_authority: 'authenticated_backend_capability',
      authority_scope: { organization_id: claims.organization_id, project_id: claims.project_id, mission_id: claims.mission_id },
      receipt: { source_digest: claims.payload_hash, source_receipt: { stimulus_sha256: claims.stimulus_sha256 } } } };
  }
  if (args[0] === 'biological') {
    if (biologicalPause) {
      biologicalPause.started.resolve();
      await biologicalPause.resume.promise;
    }
    return { ok: true, json: { tick: ++biologicalTick, receipts: [
      { schema: 'genos.synthetic-sensory-receipt/v1', source_digest: 'not-used' },
      { schema: 'genos.instinct-paf-receipt/v1', sensory_source_refs: [{ source_digest: lastSourceDigest }] },
    ] } };
  }
  throw new Error(`unexpected Rust command: ${args[0]}`);
}

async function seed(db) {
  await db.run('INSERT INTO organizations (id, name) VALUES (?, ?)', organizationId, 'Sensory Org');
  await db.run('INSERT INTO projects (id, organization_id, name) VALUES (?, ?, ?)', projectId, organizationId, 'Sensory Project');
  await db.run('INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, ?, ?, ?, ?)',
    'sensory-workspace', 'Sensory Workspace', os.tmpdir(), organizationId, projectId);
  await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id)
    VALUES (?, ?, 'coordinator', 'idle', 'orchestrator', ?)`, 'sensory-agent', 'Sensory Agent', 'sensory-workspace');
  await db.run('INSERT INTO missions (mission_id, objective, orchestrator_agent_id) VALUES (?, ?, ?)',
    missionId, 'signed sensory ingestion', 'sensory-agent');
  await db.run('INSERT INTO mission_agents (mission_id, agent_id, role) VALUES (?, ?, ?)',
    missionId, 'sensory-agent', 'orchestrator');
  await db.run('INSERT INTO organizations (id, name) VALUES (?, ?)', foreignOrganizationId, 'Other Sensory Org');
  await db.run('INSERT INTO projects (id, organization_id, name) VALUES (?, ?, ?)', foreignProjectId, foreignOrganizationId, 'Other Sensory Project');
  await db.run('INSERT INTO workspaces (id, name, path, organization_id, project_id) VALUES (?, ?, ?, ?, ?)',
    'foreign-sensory-workspace', 'Foreign Sensory Workspace', os.tmpdir(), foreignOrganizationId, foreignProjectId);
  await db.run(`INSERT INTO agents (id, name, role, status, execution_mode, workspace_id)
    VALUES (?, ?, 'coordinator', 'idle', 'orchestrator', ?)`, 'foreign-sensory-agent', 'Foreign Sensory Agent', 'foreign-sensory-workspace');
  await db.run('INSERT INTO missions (mission_id, objective, orchestrator_agent_id) VALUES (?, ?, ?)',
    foreignMissionId, 'foreign signed sensory ingestion', 'foreign-sensory-agent');
  await db.run('INSERT INTO mission_agents (mission_id, agent_id, role) VALUES (?, ?, ?)',
    foreignMissionId, 'foreign-sensory-agent', 'orchestrator');
}

function envelope(privateKey, tick, ambient) {
  const signal = { sensor: 'passive_electroreception', ambient_uv: ambient };
  const stimulusSha256 = digestStimulus(producerId, tick, serializeSignal(signal));
  const claims = JSON.stringify({ schema: 'genos.synthetic-sensory-claims/v1', missionId, tick, producerId, stimulusSha256 });
  return { schema: 'genos.signed-synthetic-sensory-input/v1', producer_id: producerId,
    signature_hex: sign(null, Buffer.from(claims), privateKey).toString('hex'), tick, signal };
}

async function request(input) {
  const headers = { 'content-type': 'application/json', 'x-organization-id': scope.organizationId, 'x-project-id': scope.projectId };
  if (input.authenticated !== false) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`http://127.0.0.1:${input.port}${input.route}`, {
    method: 'POST', headers, body: JSON.stringify(input.body),
  });
  return { status: response.status, body: await response.json() };
}

function countReceipts(db) {
  return db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'synthetic_sensory_receipts'")
    .then(table => table ? db.get('SELECT COUNT(*) AS count FROM synthetic_sensory_receipts') : { count: 0 })
    .then(row => row.count);
}

function countDispatches(db) {
  return db.get("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'synthetic_sensory_paf_dispatches'")
    .then(table => table ? db.get('SELECT COUNT(*) AS count FROM synthetic_sensory_paf_dispatches') : { count: 0 })
    .then(row => row.count);
}

run().catch(error => { console.error(error.stack || error.message, error.cause || ''); process.exit(1); });
