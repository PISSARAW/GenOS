'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { createFabric, migrateGqwf } = require('../src/services/gqwf');
const { createManifest } = require('../src/services/gqwf/manifest');
const { blobPath, putBlob } = require('../src/services/gqwf/objects');
const storage = require('../src/services/gqwf/storage');

async function fixture() {
  const parent = path.resolve(__dirname, '../../.genos-agent-worlds/gqwf-gc-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'garbage-collection-'));
  const workspacePath = path.join(root, 'workspace');
  await fs.mkdir(workspacePath);
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT NOT NULL,
      organization_id TEXT, project_id TEXT);`);
  await db.run('INSERT INTO workspaces (id, path) VALUES (?, ?)', 'workspace', workspacePath);
  await migrateGqwf(db);
  return { db, parent, root, workspacePath, fabric: createFabric(db) };
}

async function createRoot(context, label) {
  const bytes = Buffer.from(label, 'utf8');
  const hash = await putBlob(context.workspacePath, bytes);
  const built = createManifest([{ path: `${label}.txt`, hash, size: bytes.length, mode: 0o644 }]);
  await storage.putRoot(context.db, 'workspace', built);
  return { rootHash: built.hash, blobHash: hash };
}

async function createView(context, baseHash) {
  return context.fabric.createView({ workspaceId: 'workspace', baseHash });
}

async function seedReferences(context) {
  const roots = {};
  for (const label of ['head', 'view', 'lease', 'session-candidate', 'worker-candidate',
    'promotion-previous', 'event-previous', 'event-root', 'legacy', 'orphan']) {
    roots[label] = await createRoot(context, label);
  }
  await context.fabric.initializeHead({ workspaceId: 'workspace', name: 'main', rootHash: roots.head.rootHash });
  const protectedView = await createView(context, roots.view.rootHash);
  await context.fabric.writeFile({ workspaceId: 'workspace', viewId: protectedView.id,
    expectedVersion: 0, path: 'overlay.txt', content: 'overlay-only' });
  await context.db.run(`INSERT INTO gqwf_leases (id, workspace_id, root_hash, path, status)
    VALUES (?, ?, ?, ?, 'released')`, 'lease-protected', 'workspace', roots.lease.rootHash,
  path.join(context.root, 'released-lease'));
  await seedExecutionReference(context, roots);
  const workerView = await seedWorkerReference(context, roots);
  await context.db.run(`INSERT INTO gqwf_worker_promotions
    (id, worker_id, workspace_id, view_id, head_name, previous_hash, candidate_hash,
      expected_generation, published_generation, evidence_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 'promotion', 'worker', 'workspace', workerView.id,
  'main', roots['promotion-previous'].rootHash, roots['worker-candidate'].rootHash, 0, 1, 'evidence');
  await context.db.run(`INSERT INTO gqwf_head_events
    (workspace_id, name, generation, previous_hash, root_hash, evidence_id)
    VALUES (?, ?, ?, ?, ?, ?)`, 'workspace', 'history', 1, roots['event-previous'].rootHash,
  roots['event-root'].rootHash, 'historical-evidence');
  await context.db.run(`INSERT INTO gqwf_legacy_links
    (workspace_id, snapshot_id, legacy_hash, root_hash) VALUES (?, ?, ?, ?)`,
  'workspace', 'snapshot', 'legacy-hash', roots.legacy.rootHash);
  return roots;
}

async function seedExecutionReference(context, roots) {
  const view = await createView(context, roots.head.rootHash);
  await context.db.run(`INSERT INTO gqwf_leases (id, workspace_id, root_hash, path, status)
    VALUES (?, ?, ?, ?, 'released')`, 'session-lease', 'workspace', roots.head.rootHash,
  path.join(context.root, 'session-lease'));
  await context.db.run(`INSERT INTO gqwf_execution_sessions
    (execution_run_id, agent_id, workspace_id, view_id, lease_id, base_hash, candidate_hash,
      source_path, materialized_path, status, outcome)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'released', 'completed')`, 'run', 'agent', 'workspace',
  view.id, 'session-lease', roots.head.rootHash, roots['session-candidate'].rootHash,
  context.workspacePath, path.join(context.root, 'session-lease'));
}

async function seedWorkerReference(context, roots) {
  const view = await createView(context, roots.head.rootHash);
  await context.db.run(`INSERT INTO gqwf_leases (id, workspace_id, root_hash, path, status)
    VALUES (?, ?, ?, ?, 'released')`, 'worker-lease', 'workspace', roots.head.rootHash,
  path.join(context.root, 'worker-lease'));
  await context.db.run(`INSERT INTO gqwf_worker_bindings
    (worker_id, workspace_id, capsule_path, base_hash, view_id, lease_id, backend,
      candidate_hash, status, outcome)
    VALUES (?, ?, ?, ?, ?, ?, 'gqwf', ?, 'captured', 'completed')`, 'worker', 'workspace',
  path.join(context.root, 'worker-lease'), roots.head.rootHash, view.id, 'worker-lease',
  roots['worker-candidate'].rootHash);
  return view;
}

async function exists(location) {
  try { await fs.access(location); return true; } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function assertWriteBoundary(context) {
  const bytes = Buffer.from('vanished-before-root');
  const hash = await putBlob(context.workspacePath, bytes);
  await fs.unlink(blobPath(context.workspacePath, hash));
  const built = createManifest([{ path: 'vanished.txt', hash, size: bytes.length, mode: 0o644 }]);
  await assert.rejects(storage.putRoot(context.db, 'workspace', built), /ENOENT/);
  const view = await createView(context, (await context.fabric.getHead({
    workspaceId: 'workspace', name: 'main'
  })).rootHash);
  await assert.rejects(storage.mutateView(context.db, { workspaceId: 'workspace', viewId: view.id,
    expectedVersion: 0, path: 'vanished.txt', hash, size: bytes.length, mode: 0o644,
    deleted: false }), /ENOENT/);
}

async function exerciseCollection(context) {
  const roots = await seedReferences(context);
  const stray = await putBlob(context.workspacePath, Buffer.from('stray'));
  const preview = await context.fabric.inspectGarbage({ workspaceId: 'workspace' });
  assert.equal(preview.mode, 'preview');
  assert.deepEqual(preview.orphanRoots, [roots.orphan.rootHash]);
  assert.deepEqual(preview.orphanBlobs.map((blob) => blob.hash).sort(),
    [roots.orphan.blobHash, stray].sort());
  assert.equal(await exists(blobPath(context.workspacePath, stray)), true);
  await assert.rejects(context.fabric.collectGarbage({ workspaceId: 'workspace' }), /preview inventory hash/);

  await putBlob(context.workspacePath, Buffer.from('later-stray'));
  await assert.rejects(context.fabric.collectGarbage({ workspaceId: 'workspace',
    expectedInventoryHash: preview.inventoryHash }), /inventory changed/);
  const blobsRoot = path.join(context.workspacePath, '.genos', 'gqwf', 'blobs');
  const anomaly = path.join(blobsRoot, 'unexpected');
  await fs.writeFile(anomaly, 'preserve-me');
  const anomalous = await context.fabric.inspectGarbage({ workspaceId: 'workspace' });
  assert.deepEqual(anomalous.anomalies, ['unexpected']);
  await assert.rejects(context.fabric.collectGarbage({ workspaceId: 'workspace',
    expectedInventoryHash: anomalous.inventoryHash }), /anomalous blob entries/);
  assert.equal(await fs.readFile(anomaly, 'utf8'), 'preserve-me');
  await fs.unlink(anomaly);

  const current = await context.fabric.inspectGarbage({ workspaceId: 'workspace' });
  const applied = await context.fabric.collectGarbage({ workspaceId: 'workspace',
    expectedInventoryHash: current.inventoryHash });
  assert.equal(applied.mode, 'applied');
  assert.equal(applied.removedRootCount, 1);
  assert.equal(applied.removedBlobCount, 3);
  assert.equal(await exists(blobPath(context.workspacePath, roots.orphan.blobHash)), false);
  assert.equal((await context.db.get(`SELECT COUNT(*) AS count FROM gqwf_roots
    WHERE workspace_id = ? AND root_hash = ?`, 'workspace', roots.orphan.rootHash)).count, 0);
  assert.equal((await context.db.get('SELECT COUNT(*) AS count FROM gqwf_gc_runs')).count, 1);
  assert.equal((await context.fabric.inspectGarbage({ workspaceId: 'workspace' })).orphanRoots.length, 0);
  await assertWriteBoundary(context);
}

async function exerciseIntegrityScrub(context) {
  const root = await createRoot(context, 'scrubbed');
  await context.fabric.initializeHead({ workspaceId: 'workspace', name: 'main',
    rootHash: root.rootHash });
  const healthy = await context.fabric.scrubIntegrity({ workspaceId: 'workspace' });
  assert.equal(healthy.protocol, 'gqwf-scrub-v1');
  assert.equal(healthy.status, 'healthy');
  assert.equal(healthy.issueCount, 0);
  assert.equal(healthy.referencedBlobCount, 1);

  const target = blobPath(context.workspacePath, root.blobHash);
  await fs.writeFile(target, 'tampered');
  const corrupt = await context.fabric.scrubIntegrity({ workspaceId: 'workspace' });
  assert.equal(corrupt.status, 'corrupt');
  assert.deepEqual(corrupt.issues, [{ type: 'corrupt_blob', blobHash: root.blobHash }]);
  assert.equal(await fs.readFile(target, 'utf8'), 'tampered');

  await fs.unlink(target);
  const missing = await context.fabric.scrubIntegrity({ workspaceId: 'workspace' });
  assert.deepEqual(missing.issues, [{ type: 'missing_blob', blobHash: root.blobHash }]);
  const receipts = await context.db.all(`SELECT status, report_json FROM gqwf_integrity_runs
    ORDER BY created_at, id`);
  assert.equal(receipts.length, 3);
  assert.deepEqual(receipts.map((row) => row.status).sort(), ['corrupt', 'corrupt', 'healthy']);
  for (const receipt of receipts) assert.equal(JSON.parse(receipt.report_json).protocol, 'gqwf-scrub-v1');
}

async function runFixture(exercise) {
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
  await runFixture(exerciseCollection);
  await runFixture(exerciseIntegrityScrub);
  console.log('GQWF safe garbage collection and integrity scrub: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
