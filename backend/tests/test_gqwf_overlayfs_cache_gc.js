'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { createFabric, migrateGqwf } = require('../src/services/gqwf');
const { createManifest } = require('../src/services/gqwf/manifest');
const { cachePath } = require('../src/services/gqwf/materialization/overlayfsCache');
const { lowerDirectories } = require('../src/services/gqwf/materialization/overlayfsRuntime');
const { putBlob } = require('../src/services/gqwf/objects');
const storage = require('../src/services/gqwf/storage');

async function fixture(label) {
  const parent = path.resolve(__dirname, '../../.genos-agent-worlds/gqwf-overlay-cache-gc-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, `${label}-`));
  const workspacePath = path.join(root, 'workspace');
  await fs.mkdir(workspacePath);
  const db = await open({ filename: path.join(root, 'state.sqlite'), driver: sqlite3.Database });
  await db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT NOT NULL,
      organization_id TEXT, project_id TEXT);`);
  await db.run('INSERT INTO workspaces (id, path) VALUES (?, ?)', 'workspace', workspacePath);
  await migrateGqwf(db);
  const columns = await db.all('PRAGMA table_info(gqwf_gc_runs)');
  assert.equal(columns.some((column) => column.name === 'overlay_cache_count'), true);
  return { db, parent, root, workspacePath };
}

async function createRoot(context, label) {
  const bytes = Buffer.from(label);
  const blobHash = await putBlob(context.workspacePath, bytes);
  const built = createManifest([{ path: `${label}.txt`, hash: blobHash,
    size: bytes.length, mode: 0o644 }]);
  await storage.putRoot(context.db, 'workspace', built);
  await context.db.run('INSERT INTO gqwf_heads (workspace_id, name, root_hash) VALUES (?, ?, ?)',
    'workspace', label, built.hash);
  return { rootHash: built.hash, bytes, filename: `${label}.txt` };
}

async function createCache(context, root) {
  const target = cachePath(context.workspacePath, root.rootHash);
  const lower = path.join(target, 'root');
  await fs.mkdir(lower, { recursive: true });
  await fs.writeFile(path.join(lower, root.filename), root.bytes);
  await fs.writeFile(path.join(target, '.ready'), root.rootHash);
  return { target, lower };
}

async function activeOverlayLease(context, root) {
  const leaseId = `lease-${root.rootHash.slice(0, 8)}`;
  const container = path.join(context.root, leaseId);
  await context.db.run(`INSERT INTO gqwf_leases
    (id, workspace_id, root_hash, path, execution_path, status)
    VALUES (?, 'workspace', ?, ?, ?, 'open')`, leaseId, root.rootHash,
  container, path.join(container, 'root'));
  await context.db.run(`INSERT INTO gqwf_materialization_receipts
    (lease_id, workspace_id, root_hash, backend_id, contract_version,
      capabilities_json, capability_hash, selection_reason, receipt_hash)
    VALUES (?, 'workspace', ?, 'linux-overlayfs-v1', 1, '{}', ?, 'test', ?)`,
  leaseId, root.rootHash, 'a'.repeat(64), root.rootHash);
}

async function exists(location) {
  try {
    await fs.access(location);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function verifyProtectionAndCollection(context) {
  const active = await createRoot(context, 'active');
  const mounted = await createRoot(context, 'mounted');
  const inactive = await createRoot(context, 'inactive');
  const activeCache = await createCache(context, active);
  const mountedCache = await createCache(context, mounted);
  const inactiveCache = await createCache(context, inactive);
  await activeOverlayLease(context, active);
  const mounts = new Set([mountedCache.lower]);
  const fabric = createFabric(context.db, { overlayCacheRuntime: {
    usesLower: async (target) => mounts.has(target)
  } });

  const anomaly = path.join(context.workspacePath, '.genos', 'gqwf',
    'overlay-lower', 'unexpected');
  await fs.writeFile(anomaly, 'preserve');
  const anomalous = await fabric.inspectGarbage({ workspaceId: 'workspace' });
  assert.deepEqual(anomalous.anomalies, ['overlay-lower/unexpected']);
  await assert.rejects(fabric.collectGarbage({ workspaceId: 'workspace',
    expectedInventoryHash: anomalous.inventoryHash }), /OverlayFS caches/);
  assert.equal(await fs.readFile(anomaly, 'utf8'), 'preserve');
  await fs.unlink(anomaly);

  const preview = await fabric.inspectGarbage({ workspaceId: 'workspace' });
  assert.deepEqual(preview.overlayCaches.map((cache) => cache.rootHash), [inactive.rootHash]);
  assert.deepEqual(preview.mountedOverlayCaches, [mounted.rootHash]);
  assert.equal(preview.protectedOverlayCacheCount, 2);
  assert.ok(preview.reclaimableBytes >= inactive.bytes.length + 64);
  mounts.clear();
  await assert.rejects(fabric.collectGarbage({ workspaceId: 'workspace',
    expectedInventoryHash: preview.inventoryHash }), /inventory changed/);
  mounts.add(mountedCache.lower);

  const current = await fabric.inspectGarbage({ workspaceId: 'workspace' });
  const applied = await fabric.collectGarbage({ workspaceId: 'workspace',
    expectedInventoryHash: current.inventoryHash });
  assert.equal(applied.removedOverlayCacheCount, 1);
  assert.equal(await exists(inactiveCache.target), false);
  assert.equal(await exists(activeCache.target), true);
  assert.equal(await exists(mountedCache.target), true);
  const receipt = await context.db.get('SELECT overlay_cache_count FROM gqwf_gc_runs');
  assert.equal(receipt.overlay_cache_count, 1);
}

async function verifyMountRace(context) {
  const root = await createRoot(context, 'race');
  const cache = await createCache(context, root);
  let probes = 0;
  const fabric = createFabric(context.db, { overlayCacheRuntime: {
    usesLower: async () => {
      probes += 1;
      return probes >= 3;
    }
  } });
  const preview = await fabric.inspectGarbage({ workspaceId: 'workspace' });
  await assert.rejects(fabric.collectGarbage({ workspaceId: 'workspace',
    expectedInventoryHash: preview.inventoryHash }), /still mounted/);
  assert.equal(await exists(cache.target), true);
  assert.equal((await context.db.get('SELECT COUNT(*) AS count FROM gqwf_gc_runs')).count, 0);
}

async function runCase(label, test) {
  const context = await fixture(label);
  try {
    await test(context);
  } finally {
    await context.db.close();
    if (path.dirname(context.root) !== context.parent
      || !path.basename(context.root).startsWith(`${label}-`)) {
      throw new Error('Refusing to remove an unmanaged OverlayFS cache GC fixture.');
    }
    await fs.rm(context.root, { recursive: true, force: true });
  }
}

async function verifyLegacyReceiptMigration() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  try {
    await db.exec(`PRAGMA foreign_keys = ON;
      CREATE TABLE workspaces (id TEXT PRIMARY KEY, path TEXT NOT NULL,
        organization_id TEXT, project_id TEXT);
      CREATE TABLE gqwf_gc_runs (
        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, inventory_hash TEXT NOT NULL,
        root_count INTEGER NOT NULL, blob_count INTEGER NOT NULL,
        reclaimed_bytes INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );`);
    await migrateGqwf(db);
    const columns = await db.all('PRAGMA table_info(gqwf_gc_runs)');
    assert.equal(columns.some((column) => column.name === 'overlay_cache_count'), true);
  } finally {
    await db.close();
  }
}

async function main() {
  assert.deepEqual(lowerDirectories(
    '41 22 0:39 / /merged rw - overlay overlay rw,lowerdir=/lower\\040one:/lower-two,upperdir=/upper'),
  ['/lower one', '/lower-two']);
  assert.deepEqual(lowerDirectories('41 22 0:39 / /merged rw - ext4 disk rw'), []);
  await verifyLegacyReceiptMigration();
  await runCase('protection', verifyProtectionAndCollection);
  await runCase('mount-race', verifyMountRace);
  console.log('GQWF OverlayFS lower cache garbage collection: PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
