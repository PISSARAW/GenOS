const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const snapshots = require('../src/services/workspaceSnapshotStore');
const checkpoints = require('../src/services/organismOrchestratorCheckpoint');
const migration = require('../src/db/migrations/migrateOrganismRestoreJournal');

const original = { capture: snapshots.capture, getSnapshot: snapshots.getSnapshot,
  readManifest: snapshots.readManifest, restore: snapshots.restore,
  verify: checkpoints.verify, active: checkpoints.active, select: checkpoints.select,
  withMissionLocks: checkpoints.withMissionLocks };
const previous = [{ rustMissionId: 'mission', name: 'before', rewound: false }];
const target = [{ rustMissionId: 'mission', name: 'target' }];
const world = { files: 'before', head: 'before', failRestore: false };

function installFakes() {
  snapshots.capture = async () => ({ id: 'safety', snapshotHash: 'before-hash' });
  snapshots.getSnapshot = async () => ({ id: 'safety', snapshot_hash: 'before-hash' });
  snapshots.readManifest = async () => ({ files: [] });
  snapshots.restore = async () => {
    if (world.failRestore) throw new Error('injected workspace recovery failure');
    world.files = 'before';
  };
  checkpoints.verify = async () => true;
  checkpoints.active = async () => [{ ...previous[0], name: world.head,
    rewound: world.head === 'target' }];
  checkpoints.select = async () => { world.head = 'before'; };
  checkpoints.withMissionLocks = async (_references, action) => action();
}

function restoreFakes() {
  for (const key of ['capture', 'getSnapshot', 'readManifest', 'restore']) snapshots[key] = original[key];
  for (const key of ['verify', 'active', 'select', 'withMissionLocks']) checkpoints[key] = original[key];
}

async function openDatabase(file) {
  return open({ filename: file, driver: sqlite3.Database });
}

async function seed(db) {
  await db.exec("CREATE TABLE agents (id TEXT PRIMARY KEY, status TEXT, runtime_pid INTEGER)");
  await db.exec("CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT)");
  await db.run("INSERT INTO agents (id, status) VALUES ('agent', 'idle')");
  await db.run("INSERT INTO workspaces (id, path) VALUES ('workspace', 'fixture')");
  await migration.migrateOrganismRestoreJournal(db);
}

async function runScenario(root, phase, failOnce = false) {
  const file = path.join(root, `${phase}.db`);
  let db = await openDatabase(file);
  await seed(db);
  world.files = 'before';
  world.head = 'before';
  world.failRestore = false;
  const recovery = require('../src/services/organismRestoreRecovery');
  const attempt = await recovery.prepare(db, { agent: { id: 'agent', workspace_id: 'workspace' },
    workspace: { id: 'workspace', path: 'fixture' }, previous, target });
  assert.equal((await db.get('SELECT status FROM agents')).status, 'blocked');
  if (phase !== 'prepared') world.files = 'target';
  if (phase === 'rust-selected' || phase === 'sqlite-rolled-back') world.head = 'target';
  if (phase === 'sqlite-rolled-back') {
    await db.exec('BEGIN IMMEDIATE');
    await db.run("UPDATE agents SET status = 'completed' WHERE id = 'agent'");
    await recovery.complete(db, attempt.id);
    await db.exec('ROLLBACK');
  }
  await db.close();
  db = await openDatabase(file);
  world.failRestore = failOnce;
  if (failOnce) {
    await assert.rejects(() => recovery.recoverPending(db), /injected workspace recovery failure/);
    assert.equal((await db.get('SELECT status FROM organism_restore_attempts')).status, 'blocked');
    assert.equal((await db.get('SELECT status FROM agents')).status, 'blocked');
    world.failRestore = false;
  }
  assert.equal(await recovery.recoverPending(db), 1);
  assert.equal(world.files, 'before');
  assert.equal(world.head, 'before');
  assert.equal((await db.get('SELECT status FROM organism_restore_attempts')).status, 'recovered');
  assert.equal((await db.get('SELECT status FROM agents')).status, 'blocked');
  await recovery.waitUntilClear(db);
  await db.close();
}

async function committedScenario(root) {
  const file = path.join(root, 'committed.db');
  let db = await openDatabase(file);
  await seed(db);
  world.files = 'target';
  world.head = 'target';
  const recovery = require('../src/services/organismRestoreRecovery');
  const attempt = await recovery.prepare(db, { agent: { id: 'agent', workspace_id: 'workspace' },
    workspace: { id: 'workspace', path: 'fixture' }, previous, target });
  await db.exec('BEGIN IMMEDIATE');
  await db.run("UPDATE agents SET status = 'completed' WHERE id = 'agent'");
  await recovery.complete(db, attempt.id);
  await db.exec('COMMIT');
  await db.close();
  db = await openDatabase(file);
  assert.equal(await recovery.recoverPending(db), 0);
  assert.equal(world.files, 'target');
  assert.equal(world.head, 'target');
  assert.equal((await db.get('SELECT status FROM agents')).status, 'completed');
  await db.close();
}

async function main() {
  const root = await fs.mkdtemp(path.join(__dirname, 'restore-recovery-'));
  installFakes();
  try {
    for (const phase of ['prepared', 'workspace-restored', 'rust-selected', 'sqlite-rolled-back']) {
      await runScenario(root, phase, phase === 'rust-selected');
    }
    await committedScenario(root);
    console.log('Organism restore crash recovery passed.');
  } finally {
    restoreFakes();
    const resolved = path.resolve(root);
    if (path.dirname(resolved) !== path.resolve(__dirname)
      || !path.basename(resolved).startsWith('restore-recovery-')) {
      throw new Error('Refusing to remove an unexpected recovery test directory.');
    }
    await fs.rm(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
