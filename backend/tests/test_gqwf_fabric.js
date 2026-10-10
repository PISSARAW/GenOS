'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { createFabric, migrateGqwf } = require('../src/services/gqwf');
const legacyAdapter = require('../src/services/gqwf/legacy');
const workerBridge = require('../src/services/gqwf/workers');
const { collectFiles, manifestHash } = require('../src/services/workspaceSnapshotCollect');

async function fixture() {
  const parent = path.resolve(__dirname, '../../.genos-agent-worlds/gqwf-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'genos-gqwf-'));
  const workspacePath = path.join(root, 'workspace');
  await fs.mkdir(workspacePath);
  await fs.writeFile(path.join(workspacePath, 'a.txt'), 'A0');
  await fs.writeFile(path.join(workspacePath, 'b.txt'), 'B0');
  await fs.writeFile(path.join(workspacePath, '.env'), 'excluded');
  const db = await open({ filename: path.join(root, 'gqwf.sqlite'), driver: sqlite3.Database });
  await db.exec('PRAGMA foreign_keys = ON; CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT NOT NULL, organization_id TEXT, project_id TEXT);');
  await db.exec('CREATE TABLE agent_capsule_cleanup (agent_id TEXT PRIMARY KEY, workspace_root TEXT NOT NULL);');
  await db.exec(`CREATE TABLE workspace_snapshots (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, snapshot_hash TEXT NOT NULL,
    step_number INTEGER NOT NULL, label TEXT NOT NULL, author TEXT NOT NULL,
    reason TEXT, diff_summary TEXT, metadata TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );`);
  await db.run('INSERT INTO workspaces (id, path) VALUES (?, ?)', 'ws-a', workspacePath);
  await migrateGqwf(db);
  return { root, workspacePath, db };
}

async function exerciseViews(context) {
  const fabric = createFabric(context.db);
  const base = await fabric.importBase({ workspaceId: 'ws-a' });
  assert.equal(base.fileCount, 2);
  const first = await fabric.createView({ workspaceId: 'ws-a', baseHash: base.rootHash });
  const second = await fabric.createView({ workspaceId: 'ws-a', baseHash: base.rootHash });
  const racing = await fabric.createView({ workspaceId: 'ws-a', baseHash: base.rootHash });
  const concurrent = await Promise.allSettled(['one.txt', 'two.txt'].map((filePath) =>
    fabric.writeFile({ workspaceId: 'ws-a', viewId: racing.id,
      path: filePath, content: filePath, expectedVersion: 0 })));
  assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(concurrent.filter((result) => result.status === 'rejected').length, 1);
  assert.equal(await fabric.writeFile({ workspaceId: 'ws-a', viewId: first.id,
    path: 'a.txt', content: 'A1', expectedVersion: 0 }), 1);
  await assert.rejects(fabric.writeFile({ workspaceId: 'ws-a', viewId: first.id,
    path: 'a.txt', content: 'stale', expectedVersion: 0 }), /version conflict/);
  assert.equal((await fabric.readFile({ workspaceId: 'ws-a', viewId: second.id, path: 'a.txt' })).toString(), 'A0');
  assert.equal(await fabric.deleteFile({ workspaceId: 'ws-a', viewId: first.id,
    path: 'b.txt', expectedVersion: 1 }), 2);
  await assert.rejects(fabric.readFile({ workspaceId: 'ws-a', viewId: first.id, path: 'b.txt' }), /not found/);
  const sealed = await fabric.sealView({ workspaceId: 'ws-a', viewId: first.id, expectedVersion: 2 });
  await assert.rejects(fabric.sealView({ workspaceId: 'ws-a', viewId: first.id, expectedVersion: 1 }), /version conflict/);
  const again = await fabric.importBase({ workspaceId: 'ws-a' });
  assert.equal(again.rootHash, base.rootHash);
  const legacyFiles = await collectFiles(context.workspacePath);
  const legacy = { id: 'legacy-1', snapshot_hash: manifestHash(legacyFiles) };
  const fakeStore = { async getSnapshot() { return legacy; },
    async readManifest() { return { files: legacyFiles, payloadRoot: context.workspacePath }; } };
  const linked = await legacyAdapter.importLegacySnapshot(context.db,
    { workspaceId: 'ws-a', reference: legacy.id }, fakeStore);
  assert.equal(linked.rootHash, base.rootHash);
  assert.equal((await legacyAdapter.importLegacySnapshot(context.db,
    { workspaceId: 'ws-a', reference: legacy.id }, fakeStore)).rootHash, base.rootHash);
  assert.equal((await fs.readFile(path.join(context.workspacePath, 'a.txt'), 'utf8')), 'A0');
  return { fabric, base, sealed, second };
}

async function exerciseMerge(context, state) {
  const { fabric, base, sealed, second } = state;
  await fabric.writeFile({ workspaceId: 'ws-a', viewId: second.id,
    path: 'c.txt', content: 'C1', expectedVersion: 0 });
  const right = await fabric.sealView({ workspaceId: 'ws-a', viewId: second.id, expectedVersion: 1 });
  const merged = await fabric.mergeRoots({ workspaceId: 'ws-a', baseHash: base.rootHash,
    candidateHash: sealed.rootHash, currentHash: right.rootHash });
  assert.equal(merged.merged, true);
  const lease = await fabric.materializeRoot({ workspaceId: 'ws-a', rootHash: merged.rootHash });
  assert.equal(await fs.readFile(path.join(lease.path, 'a.txt'), 'utf8'), 'A1');
  assert.equal(await fs.readFile(path.join(lease.path, 'c.txt'), 'utf8'), 'C1');
  await assert.rejects(fs.readFile(path.join(lease.path, 'b.txt')), { code: 'ENOENT' });
  await fs.writeFile(path.join(lease.path, 'c.txt'), 'C2');
  const ingested = await fabric.ingestLease({ workspaceId: 'ws-a', leaseId: lease.leaseId });
  assert.notEqual(ingested.rootHash, merged.rootHash);
  await fabric.releaseLease({ workspaceId: 'ws-a', leaseId: lease.leaseId });
  await assert.rejects(fs.stat(lease.path), { code: 'ENOENT' });

  const conflicting = await fabric.createView({ workspaceId: 'ws-a', baseHash: base.rootHash });
  await fabric.writeFile({ workspaceId: 'ws-a', viewId: conflicting.id,
    path: 'a.txt', content: 'other', expectedVersion: 0 });
  const conflictingRoot = await fabric.sealView({ workspaceId: 'ws-a', viewId: conflicting.id, expectedVersion: 1 });
  const result = await fabric.mergeRoots({ workspaceId: 'ws-a', baseHash: base.rootHash,
    candidateHash: sealed.rootHash, currentHash: conflictingRoot.rootHash });
  assert.deepEqual(result, { merged: false, conflicts: ['a.txt'] });
  return ingested.rootHash;
}

async function exercisePromotion(context, baseHash, candidateHash) {
  const blocked = createFabric(context.db);
  await blocked.initializeHead({ workspaceId: 'ws-a', name: 'main', rootHash: baseHash });
  await assert.rejects(blocked.publishCandidate({ workspaceId: 'ws-a', name: 'main',
    expectedHash: baseHash, expectedGeneration: 0, candidateHash }), /verifier is unavailable/);
  const verified = createFabric(context.db, { verifyPromotion: async (input) => ({
    success: true, candidateHash: input.candidateHash, evidenceId: 'verified-receipt-1'
  }) });
  const published = await verified.publishCandidate({ workspaceId: 'ws-a', name: 'main',
    expectedHash: baseHash, expectedGeneration: 0, candidateHash });
  assert.equal(published.generation, 1);
  await assert.rejects(verified.publishCandidate({ workspaceId: 'ws-a', name: 'main',
    expectedHash: baseHash, expectedGeneration: 0, candidateHash }), /head changed/);
  assert.deepEqual(await verified.getHead({ workspaceId: 'ws-a', name: 'main' }),
    { rootHash: candidateHash, generation: 1 });
}

async function exerciseWorkerBridge(context) {
  const capsule = path.join(context.root, 'worker-capsule');
  await fs.mkdir(capsule);
  await fs.writeFile(path.join(capsule, 'a.txt'), 'A0');
  await fs.writeFile(path.join(capsule, 'b.txt'), 'B0');
  await context.db.run('INSERT INTO agent_capsule_cleanup (agent_id, workspace_root) VALUES (?, ?)', 'worker-1', capsule);
  await assert.rejects(workerBridge.bindWorker(context.db, {
    workerId: 'worker-2', workspaceId: 'ws-a', capsulePath: capsule
  }), /not owned/);
  const bound = await workerBridge.bindWorker(context.db, {
    workerId: 'worker-1', workspaceId: 'ws-a', capsulePath: capsule
  });
  assert.equal(bound.status, 'open');
  const fabric = createFabric(context.db);
  assert.equal((await fabric.inspectWorker({ workspaceId: 'ws-a', workerId: 'worker-1' })).viewId, bound.viewId);
  await assert.rejects(fabric.inspectWorker({ workspaceId: 'other', workerId: 'worker-1' }), /not found/);
  assert.equal((await workerBridge.bindWorker(context.db, {
    workerId: 'worker-1', workspaceId: 'ws-a', capsulePath: capsule
  })).viewId, bound.viewId);
  await fs.writeFile(path.join(capsule, 'a.txt'), 'A2');
  await fs.rm(path.join(capsule, 'b.txt'));
  await fs.writeFile(path.join(capsule, 'c.txt'), 'C2');
  await fs.writeFile(path.join(capsule, 'CON'), 'invalid');
  await assert.rejects(workerBridge.captureWorker(context.db, 'worker-1'), /not portable/);
  assert.equal((await workerBridge.binding(context.db, 'worker-1')).status, 'capture_failed');
  await fs.rm(path.join(capsule, 'CON'));
  const captured = await workerBridge.captureWorker(context.db, 'worker-1');
  assert.equal(captured.status, 'captured');
  assert.notEqual(captured.candidateHash, bound.baseHash);
  const files = await fabric.listFiles({ workspaceId: 'ws-a', viewId: bound.viewId });
  assert.deepEqual(files.files.map((file) => file.path), ['a.txt', 'c.txt']);
  assert.equal((await fabric.readFile({ workspaceId: 'ws-a', viewId: bound.viewId, path: 'a.txt' })).toString(), 'A2');
  assert.equal((await fabric.sealView({ workspaceId: 'ws-a', viewId: bound.viewId,
    expectedVersion: files.version })).rootHash, captured.candidateHash);
  assert.equal((await workerBridge.captureWorker(context.db, 'worker-1')).candidateHash, captured.candidateHash);
}

async function main() {
  const context = await fixture();
  try {
    const state = await exerciseViews(context);
    const candidateHash = await exerciseMerge(context, state);
    await exercisePromotion(context, state.base.rootHash, candidateHash);
    await exerciseWorkerBridge(context);
    await assert.rejects(state.fabric.createView({ workspaceId: 'other', baseHash: state.base.rootHash }), /not reachable/);
    await assert.rejects(state.fabric.writeFile({ workspaceId: 'ws-a', viewId: state.second.id,
      path: '../escape', content: 'x', expectedVersion: 1 }), /unsafe path segment/);
    const fromDb = await context.db.get('SELECT manifest_json FROM gqwf_roots WHERE workspace_id = ? AND root_hash = ?', 'ws-a', state.base.rootHash);
    const manifest = JSON.parse(fromDb.manifest_json);
    const firstBlob = manifest.files[0].hash;
    const blobPath = path.join(context.workspacePath, '.genos', 'gqwf', 'blobs', firstBlob.slice(0, 2), firstBlob);
    await fs.writeFile(blobPath, 'corrupt');
    await assert.rejects(state.fabric.readFile({ workspaceId: 'ws-a', viewId: state.second.id,
      path: manifest.files[0].path }), /integrity check failed/);
    await fs.writeFile(blobPath, await fs.readFile(path.join(context.workspacePath, manifest.files[0].path)));
    await fs.writeFile(path.join(context.workspacePath, 'CON'), 'reserved');
    await assert.rejects(state.fabric.importBase({ workspaceId: 'ws-a' }), /not portable/);
    await context.db.close();
    context.db = await open({ filename: path.join(context.root, 'gqwf.sqlite'), driver: sqlite3.Database });
    const reopened = createFabric(context.db);
    assert.equal((await reopened.getHead({ workspaceId: 'ws-a', name: 'main' })).rootHash, candidateHash);
    console.log('GQWF fabric checks passed.');
  } finally {
    await context.db.close();
    const parent = path.resolve(__dirname, '../../.genos-agent-worlds/gqwf-tests');
    if (path.dirname(context.root) !== parent || !path.basename(context.root).startsWith('genos-gqwf-')) {
      throw new Error('Refusing to remove an unmanaged GQWF fixture.');
    }
    await fs.rm(context.root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
