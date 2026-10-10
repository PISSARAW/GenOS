const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { fork } = require('node:child_process');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const snapshots = require('../src/services/workspaceSnapshotStore');
const checkpoints = require('../src/services/organismOrchestratorCheckpoint');
const recovery = require('../src/services/organismRestoreRecovery');
const migration = require('../src/db/migrations/migrateOrganismRestoreJournal');

const PHASES = ['prepared', 'workspace', 'rust', 'sqlite-uncommitted', 'committed'];
const MISSION_ID = '00000000-0000-4000-8000-000000000099';

async function openDatabase(file) {
  return open({ filename: file, driver: sqlite3.Database });
}

async function seedDatabase(db, workspacePath) {
  await db.exec('CREATE TABLE agents (id TEXT PRIMARY KEY, status TEXT, runtime_pid INTEGER)');
  await db.exec('CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT)');
  await db.exec(`CREATE TABLE workspace_snapshots (id TEXT PRIMARY KEY, workspace_id TEXT,
    snapshot_hash TEXT, step_number INTEGER, label TEXT, author TEXT, reason TEXT,
    diff_summary TEXT, metadata TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  await db.run("INSERT INTO agents (id, status) VALUES ('agent', 'idle')");
  await db.run("INSERT INTO workspaces (id, path) VALUES ('workspace', ?)", workspacePath);
  await migration.migrateOrganismRestoreJournal(db);
}

async function writeCheckpoint(directory, sequence) {
  const bytes = Buffer.from(JSON.stringify({ seq_id: sequence, orchestrator_state: {
    mission_id: MISSION_ID, orchestrator: { ready: true } } }));
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const name = `checkpoint-${sequence}-${hash}.json`;
  await fs.writeFile(path.join(directory, name), bytes);
  return { rustMissionId: MISSION_ID, name, seq: sequence, hash };
}

async function createFixture(root) {
  const workspacePath = path.join(root, 'workspace');
  const studioPath = path.join(root, 'studio');
  const tempPath = path.join(root, 'temp');
  const file = path.join(root, 'state.db');
  await fs.mkdir(workspacePath, { recursive: true });
  await fs.mkdir(tempPath, { recursive: true });
  const db = await openDatabase(file);
  await seedDatabase(db, workspacePath);
  await fs.writeFile(path.join(workspacePath, 'state.txt'), 'target');
  const targetSnapshot = await snapshots.capture({ db,
    workspace: { id: 'workspace', path: workspacePath }, agentId: 'agent' });
  await fs.writeFile(path.join(workspacePath, 'state.txt'), 'before');
  const directory = path.join(studioPath, 'biological-receipts', `${MISSION_ID}.continuity`);
  await fs.mkdir(directory, { recursive: true });
  const previous = { ...await writeCheckpoint(directory, 7), rewound: false };
  const target = await writeCheckpoint(directory, 8);
  await checkpoints.select([previous]);
  await db.close();
  return { file, workspacePath, studioPath, tempPath, targetSnapshotId: targetSnapshot.id,
    previous: [previous], target: [target] };
}

function waitForPhase(child, phase) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`Child did not reach ${phase}.`)), 30000);
    const onMessage = (message) => {
      if (message?.phase === phase) finish();
      else if (message?.error) finish(new Error(message.error));
    };
    const onExit = (code, signal) => finish(new Error(`Child exited before ${phase}: ${code || signal}`));
    function finish(error) {
      clearTimeout(timer);
      child.off('message', onMessage);
      child.off('exit', onExit);
      if (error) reject(error);
      else resolve();
    }
    child.on('message', onMessage);
    child.on('exit', onExit);
  });
}

async function stopAtPhase(configPath, phase, fixture) {
  const child = fork(__filename, ['child', configPath, phase], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    env: { ...process.env, GENOS_STUDIO_ROOT: fixture.studioPath,
      TEMP: fixture.tempPath, TMP: fixture.tempPath } });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += String(chunk).slice(0, 1000); });
  try {
    await waitForPhase(child, phase);
  } catch (error) {
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise((resolve) => child.once('close', resolve));
      child.kill('SIGKILL');
      await stopped;
    }
    throw new Error(`${error.message} ${stderr}`);
  }
  const stopped = new Promise((resolve) => child.once('close', resolve));
  assert.equal(child.kill('SIGKILL'), true);
  await stopped;
}

async function verifyRecovery(fixture, phase) {
  const db = await openDatabase(fixture.file);
  try {
    const committed = phase === 'committed';
    assert.equal((await db.get('SELECT status FROM organism_restore_attempts')).status,
      committed ? 'committed' : 'pending');
    assert.equal(await recovery.recoverPending(db), committed ? 0 : 1);
    assert.equal((await db.get('SELECT status FROM organism_restore_attempts')).status,
      committed ? 'committed' : 'recovered');
    assert.equal((await db.get('SELECT status FROM agents')).status,
      committed ? 'completed' : 'blocked');
    assert.equal(await fs.readFile(path.join(fixture.workspacePath, 'state.txt'), 'utf8'),
      committed ? 'target' : 'before');
    const active = await checkpoints.active(fixture.previous);
    assert.equal(active[0].name, committed ? fixture.target[0].name : fixture.previous[0].name);
  } finally {
    await db.close();
  }
}

async function runScenario(root, phase) {
  const directory = path.join(root, phase);
  await fs.mkdir(directory);
  const fixture = await createFixture(directory);
  const configPath = path.join(directory, 'scenario.json');
  await fs.writeFile(configPath, JSON.stringify(fixture));
  await stopAtPhase(configPath, phase, fixture);
  await verifyRecovery(fixture, phase);
}

async function childMain(configPath, phase) {
  const fixture = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const db = await openDatabase(fixture.file);
  const workspace = { id: 'workspace', path: fixture.workspacePath };
  const prepared = await recovery.prepare(db, { agent: { id: 'agent', workspace_id: 'workspace', status: 'idle' },
    workspace, previous: fixture.previous, target: fixture.target });
  if (phase === 'prepared') return signalPhase(phase);
  await snapshots.restore({ db, workspace, reference: fixture.targetSnapshotId });
  if (phase === 'workspace') return signalPhase(phase);
  await checkpoints.select(fixture.target);
  if (phase === 'rust') return signalPhase(phase);
  await db.exec('BEGIN IMMEDIATE');
  await db.run("UPDATE agents SET status = 'completed' WHERE id = 'agent'");
  await recovery.complete(db, prepared.id);
  if (phase === 'sqlite-uncommitted') return signalPhase(phase);
  await db.exec('COMMIT');
  signalPhase(phase);
}

function signalPhase(phase) {
  process.send({ phase });
  setInterval(() => {}, 1000);
  return new Promise(() => {});
}

async function removeFixtureRoot(root) {
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(__dirname)
    || !path.basename(resolved).startsWith('organism-crash-')) {
    throw new Error('Refusing to remove an unexpected crash test directory.');
  }
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await fs.rm(resolved, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!['EBUSY', 'EPERM', 'ENOTEMPTY'].includes(error.code) || attempt === 19) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

async function main() {
  const root = await fs.mkdtemp(path.join(__dirname, 'organism-crash-'));
  const previousRoot = process.env.GENOS_STUDIO_ROOT;
  const previousTemp = process.env.TEMP;
  const previousTmp = process.env.TMP;
  try {
    for (const phase of PHASES) {
      const scenario = path.join(root, phase);
      process.env.GENOS_STUDIO_ROOT = path.join(scenario, 'studio');
      process.env.TEMP = path.join(scenario, 'temp');
      process.env.TMP = path.join(scenario, 'temp');
      await runScenario(root, phase);
    }
    console.log('Organism restore SIGKILL recovery passed.');
  } finally {
    if (previousRoot === undefined) delete process.env.GENOS_STUDIO_ROOT;
    else process.env.GENOS_STUDIO_ROOT = previousRoot;
    if (previousTemp === undefined) delete process.env.TEMP;
    else process.env.TEMP = previousTemp;
    if (previousTmp === undefined) delete process.env.TMP;
    else process.env.TMP = previousTmp;
    await removeFixtureRoot(root);
  }
}

if (process.argv[2] === 'child') {
  childMain(process.argv[3], process.argv[4]).catch((error) => {
    process.send({ error: error.stack || error.message });
    process.exitCode = 1;
  });
} else {
  main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
}
