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
  return { ...request, allowed: true, evidenceId: 'tenant-repair-policy' };
}

async function fixture() {
  const parent = path.resolve(__dirname, '../../.genos-agent-worlds/gqwf-repair-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'repair-'));
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT NOT NULL,
      organization_id TEXT, project_id TEXT);`);
  const paths = {};
  for (const id of ['source', 'target', 'unproven', 'foreign']) {
    paths[id] = path.join(root, id);
    await fs.mkdir(paths[id]);
  }
  await db.run('INSERT INTO workspaces VALUES (?, ?, ?, ?)',
    'source', paths.source, 'organization-a', 'project-a');
  await db.run('INSERT INTO workspaces VALUES (?, ?, ?, ?)',
    'target', paths.target, 'organization-a', 'project-a');
  await db.run('INSERT INTO workspaces VALUES (?, ?, ?, ?)',
    'unproven', paths.unproven, 'organization-a', 'project-a');
  await db.run('INSERT INTO workspaces VALUES (?, ?, ?, ?)',
    'foreign', paths.foreign, 'organization-b', 'project-a');
  await migrateGqwf(db);
  const options = { authorizeReplication: authorization, authorizeRepair: authorization };
  return { db, parent, root, paths, fabric: createFabric(db, options) };
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

async function replicate(context, source, targetWorkspaceId = 'target') {
  const input = { sourceWorkspaceId: 'source', targetWorkspaceId,
    rootHash: source.built.hash };
  const preview = await context.fabric.inspectReplication(input);
  await context.fabric.replicateRoot({ ...input, expectedPlanHash: preview.planHash });
  return input;
}

async function assertHealthy(context, source) {
  for (let index = 0; index < source.hashes.length; index += 1) {
    const bytes = await readBlob(context.paths.target, source.hashes[index]);
    assert.equal(bytes.equals(source.contents[index]), true);
  }
  const report = await context.fabric.scrubIntegrity({ workspaceId: 'target' });
  assert.equal(report.status, 'healthy');
}

async function exerciseRepair(context) {
  const source = await sourceRoot(context);
  const input = await replicate(context, source);
  await fs.unlink(blobPath(context.paths.target, source.hashes[0]));
  await fs.writeFile(blobPath(context.paths.target, source.hashes[1]), 'tampered');
  const preview = await context.fabric.inspectRepair(input);
  assert.equal(preview.protocol, 'gqwf-cas-repair-v1');
  assert.equal(preview.repairBlobCount, 2);
  assert.equal(preview.missingBlobCount, 1);
  assert.equal(preview.corruptBlobCount, 1);
  await assert.rejects(context.fabric.repairRoot({ ...input,
    expectedPlanHash: '0'.repeat(64) }), /plan changed/);
  const receipt = await context.fabric.repairRoot({ ...input,
    expectedPlanHash: preview.planHash });
  assert.equal(receipt.replayed, false);
  assert.equal(receipt.repairedBlobCount, 2);
  assert.equal(receipt.quarantinedBlobCount, 1);
  assert.notEqual(receipt.beforeInventoryHash, receipt.afterInventoryHash);
  await assertHealthy(context, source);
  const replay = await context.fabric.repairRoot({ ...input,
    expectedPlanHash: preview.planHash });
  assert.equal(replay.replayed, true);
  assert.equal(replay.receiptId, receipt.receiptId);
  assert.equal((await context.db.get('SELECT COUNT(*) AS count FROM gqwf_repair_receipts')).count, 1);
  await fs.writeFile(blobPath(context.paths.target, source.hashes[1]), 'tampered-again');
  const secondPreview = await context.fabric.inspectRepair(input);
  const second = await context.fabric.repairRoot({ ...input,
    expectedPlanHash: secondPreview.planHash });
  assert.equal(second.replayed, false);
  assert.equal(second.repairedBlobCount, 1);
  assert.equal((await context.db.get('SELECT COUNT(*) AS count FROM gqwf_repair_receipts')).count, 2);
  await assertHealthy(context, source);
}

async function exerciseRefusals(context) {
  const source = await sourceRoot(context);
  const input = await replicate(context, source);
  const unsafeBlob = blobPath(context.paths.target, source.hashes[0]);
  await fs.unlink(unsafeBlob);
  await fs.mkdir(unsafeBlob);
  await assert.rejects(context.fabric.inspectRepair(input), /target blob is unsafe/);
  await fs.rmdir(unsafeBlob);
  await putBlob(context.paths.target, source.contents[0]);
  for (const hash of source.hashes) {
    const bytes = await readBlob(context.paths.source, hash);
    await putBlob(context.paths.unproven, bytes);
  }
  await storage.putRoot(context.db, 'unproven', source.built);
  await assert.rejects(context.fabric.inspectRepair({ sourceWorkspaceId: 'source',
    targetWorkspaceId: 'unproven', rootHash: source.built.hash }), /verified replication receipt/);
  await assert.rejects(context.fabric.inspectRepair({ sourceWorkspaceId: 'source',
    targetWorkspaceId: 'foreign', rootHash: source.built.hash }), /same tenant scope/);
  const denied = createFabric(context.db, { authorizeRepair: async () => ({ allowed: false }) });
  await assert.rejects(denied.inspectRepair(input), /bound authorization evidence/);
  const absent = createFabric(context.db);
  await assert.rejects(absent.inspectRepair(input), /authorizer is unavailable/);
  await context.db.run(`UPDATE gqwf_replication_receipts SET receipt_json = '{}'
    WHERE source_workspace_id = ? AND target_workspace_id = ?`, 'source', 'target');
  await assert.rejects(context.fabric.inspectRepair(input),
    /replication receipt integrity check failed/);
}

async function exerciseSourceTamper(context) {
  const source = await sourceRoot(context);
  const input = await replicate(context, source);
  await fs.writeFile(blobPath(context.paths.source, source.hashes[0]), 'forged-source');
  await assert.rejects(context.fabric.inspectRepair(input), /blob integrity check failed/);
}

async function exerciseTamper(context) {
  const source = await sourceRoot(context);
  const input = await replicate(context, source);
  await fs.unlink(blobPath(context.paths.target, source.hashes[0]));
  const preview = await context.fabric.inspectRepair(input);
  const receipt = await context.fabric.repairRoot({ ...input,
    expectedPlanHash: preview.planHash });
  await context.db.run('UPDATE gqwf_repair_receipts SET receipt_json = ? WHERE id = ?',
    '{}', receipt.receiptId);
  await assert.rejects(context.fabric.repairRoot({ ...input,
    expectedPlanHash: preview.planHash }), /receipt integrity check failed/);
}

async function run(exercise) {
  const context = await fixture();
  try { await exercise(context); } finally {
    await context.db.close();
    assert.equal(path.dirname(context.root), context.parent);
    await fs.rm(context.root, { recursive: true, force: true });
  }
}

async function main() {
  await run(exerciseRepair);
  await run(exerciseRefusals);
  await run(exerciseSourceTamper);
  await run(exerciseTamper);
  console.log('GQWF authenticated repair from verified replica: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
