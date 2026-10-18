'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { createFabric, migrateGqwf } = require('../src/services/gqwf');
const { createManifest } = require('../src/services/gqwf/manifest');
const { blobPath, putBlob, readBlob } = require('../src/services/gqwf/objects');
const storage = require('../src/services/gqwf/storage');

function authorization(request) {
  return { ...request, allowed: true, evidenceId: 'tenant-policy-evidence' };
}

async function fixture() {
  const parent = path.resolve(__dirname, '../../.genos-agent-worlds/gqwf-replication-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'replication-'));
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT NOT NULL,
      organization_id TEXT, project_id TEXT);`);
  const paths = {};
  for (const id of ['source', 'target', 'foreign']) {
    paths[id] = path.join(root, id);
    await fs.mkdir(paths[id]);
  }
  await db.run('INSERT INTO workspaces VALUES (?, ?, ?, ?)',
    'source', paths.source, 'organization-a', 'project-a');
  await db.run('INSERT INTO workspaces VALUES (?, ?, ?, ?)',
    'target', paths.target, 'organization-a', 'project-a');
  await db.run('INSERT INTO workspaces VALUES (?, ?, ?, ?)',
    'foreign', paths.foreign, 'organization-b', 'project-a');
  await migrateGqwf(db);
  return { db, parent, root, paths,
    fabric: createFabric(db, { authorizeReplication: authorization }) };
}

async function sourceRoot(context) {
  const contents = [Buffer.from('alpha'), Buffer.from('beta')];
  const hashes = [];
  for (const bytes of contents) hashes.push(await putBlob(context.paths.source, bytes));
  const built = createManifest([
    { path: 'alpha.txt', hash: hashes[0], size: contents[0].length, mode: 0o644 },
    { path: 'beta.txt', hash: hashes[1], size: contents[1].length, mode: 0o644 }
  ]);
  await storage.putRoot(context.db, 'source', built);
  return { built, hashes, contents };
}

async function assertCopied(context, source) {
  const manifest = await storage.root(context.db, 'target', source.built.hash);
  assert.equal(manifest.files.length, 2);
  for (let index = 0; index < source.hashes.length; index += 1) {
    const bytes = await readBlob(context.paths.target, source.hashes[index]);
    assert.equal(bytes.equals(source.contents[index]), true);
  }
}

async function exerciseReplication(context) {
  const source = await sourceRoot(context);
  await putBlob(context.paths.target, source.contents[0]);
  const input = { sourceWorkspaceId: 'source', targetWorkspaceId: 'target',
    rootHash: source.built.hash };
  const preview = await context.fabric.inspectReplication(input);
  assert.equal(preview.protocol, 'gqwf-cas-replication-v1');
  assert.equal(preview.reusedBlobCount, 1);
  assert.equal(preview.transferBlobCount, 1);
  assert.equal(preview.transferBytes, source.contents[1].length);

  await assert.rejects(context.fabric.replicateRoot({ ...input,
    expectedPlanHash: '0'.repeat(64) }), /plan changed/);
  const receipt = await context.fabric.replicateRoot({ ...input,
    expectedPlanHash: preview.planHash });
  assert.equal(receipt.replayed, false);
  assert.equal(receipt.transferredBlobCount, 1);
  assert.equal(receipt.reusedBlobCount, 1);
  await assertCopied(context, source);

  const replay = await context.fabric.replicateRoot({ ...input,
    expectedPlanHash: preview.planHash });
  assert.equal(replay.replayed, true);
  assert.equal(replay.receiptId, receipt.receiptId);
  assert.equal((await context.db.get('SELECT COUNT(*) AS count FROM gqwf_replication_receipts')).count, 1);

  await fs.writeFile(blobPath(context.paths.target, source.hashes[1]), 'tampered');
  await assert.rejects(context.fabric.replicateRoot({ ...input,
    expectedPlanHash: preview.planHash }), /target blob is corrupt/);
}

async function exerciseRefusals(context) {
  const source = await sourceRoot(context);
  const rootHash = source.built.hash;
  await assert.rejects(context.fabric.inspectReplication({ sourceWorkspaceId: 'source',
    targetWorkspaceId: 'foreign', rootHash }), /same tenant scope/);
  await assert.rejects(context.fabric.inspectReplication({ sourceWorkspaceId: 'source',
    targetWorkspaceId: 'source', rootHash }), /target must differ/);
  const denied = createFabric(context.db, { authorizeReplication: async () => ({ allowed: false }) });
  await assert.rejects(denied.inspectReplication({ sourceWorkspaceId: 'source',
    targetWorkspaceId: 'target', rootHash }), /bound authorization evidence/);
  const absent = createFabric(context.db);
  await assert.rejects(absent.inspectReplication({ sourceWorkspaceId: 'source',
    targetWorkspaceId: 'target', rootHash }), /authorizer is unavailable/);
}

async function run(exercise) {
  const context = await fixture();
  try {
    await exercise(context);
  } finally {
    await context.db.close();
    assert.equal(path.dirname(context.root), context.parent);
    await fs.rm(context.root, { recursive: true, force: true });
  }
}

async function main() {
  await run(exerciseReplication);
  await run(exerciseRefusals);
  console.log('GQWF authorized CAS replication and resumable deduplication: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
