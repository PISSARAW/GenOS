'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { withTransaction } = require('../../db');
const { parseManifest } = require('./manifest');
const { blobPath, readBlob } = require('./objects');
const { scanBlobStore } = require('./blobInventory');
const { createOverlayfsCacheManager } = require('./materialization/overlayfsCache');
const storage = require('./storage');

const HASH = /^[a-f0-9]{64}$/;
const ROOT_REFERENCES = [
  'SELECT root_hash AS hash FROM gqwf_heads WHERE workspace_id = ?',
  'SELECT base_hash AS hash FROM gqwf_views WHERE workspace_id = ?',
  'SELECT root_hash AS hash FROM gqwf_leases WHERE workspace_id = ?',
  'SELECT base_hash AS hash FROM gqwf_execution_sessions WHERE workspace_id = ?',
  'SELECT candidate_hash AS hash FROM gqwf_execution_sessions WHERE workspace_id = ?',
  'SELECT previous_hash AS hash FROM gqwf_head_events WHERE workspace_id = ?',
  'SELECT root_hash AS hash FROM gqwf_head_events WHERE workspace_id = ?',
  'SELECT root_hash AS hash FROM gqwf_legacy_links WHERE workspace_id = ?',
  'SELECT base_hash AS hash FROM gqwf_worker_bindings WHERE workspace_id = ?',
  'SELECT candidate_hash AS hash FROM gqwf_worker_bindings WHERE workspace_id = ?',
  'SELECT previous_hash AS hash FROM gqwf_worker_promotions WHERE workspace_id = ?',
  'SELECT candidate_hash AS hash FROM gqwf_worker_promotions WHERE workspace_id = ?'
];

function fingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function protectedRoots(db, workspaceId) {
  const hashes = new Set();
  for (const query of ROOT_REFERENCES) {
    const rows = await db.all(query, workspaceId);
    for (const row of rows) if (row.hash) hashes.add(row.hash);
  }
  return hashes;
}

async function rootCatalog(db, workspaceId) {
  const rows = await db.all(`SELECT root_hash, manifest_json FROM gqwf_roots
    WHERE workspace_id = ? ORDER BY root_hash`, workspaceId);
  return new Map(rows.map((row) => [row.root_hash, parseManifest(row.manifest_json, row.root_hash)]));
}

async function overlayBlobs(db, workspaceId) {
  const rows = await db.all(`SELECT c.blob_hash AS hash FROM gqwf_changes c
    JOIN gqwf_views v ON v.id = c.view_id
    WHERE v.workspace_id = ? AND c.deleted = 0 AND c.blob_hash IS NOT NULL`, workspaceId);
  return new Set(rows.map((row) => row.hash));
}

async function activeOverlayRoots(db, workspaceId) {
  const rows = await db.all(`SELECT DISTINCT leases.root_hash AS hash
    FROM gqwf_leases leases
    JOIN gqwf_materialization_receipts receipts ON receipts.lease_id = leases.id
    WHERE leases.workspace_id = ? AND receipts.backend_id = 'linux-overlayfs-v1'
      AND leases.status <> 'released'`, workspaceId);
  return new Set(rows.map((row) => row.hash));
}

function addManifestBlobs(output, catalog, roots) {
  for (const hash of roots) {
    const manifest = catalog.get(hash);
    if (!manifest) throw new Error(`GQWF metadata references missing root: ${hash}`);
    for (const file of manifest.files) output.add(file.hash);
  }
}

function assertReachableBlobs(reachable, scanned) {
  const stored = new Set(scanned.blobs.map((blob) => blob.hash));
  const missing = [...reachable].filter((hash) => !stored.has(hash)).sort();
  if (missing.length) throw new Error(`GQWF reachable blobs are missing or corrupt: ${missing.join(', ')}`);
}

function inventoryReport(state) {
  const { workspaceId, catalog, protectedSet, reachable, scanned,
    cacheScan, activeCaches } = state;
  const orphanRoots = [...catalog.keys()].filter((hash) => !protectedSet.has(hash)).sort();
  const orphanBlobs = scanned.blobs.filter((blob) => !reachable.has(blob.hash));
  const classifiedCaches = cacheScan.caches.map((cache) => ({ ...cache,
    active: activeCaches.has(cache.rootHash) }));
  const reclaimableCaches = classifiedCaches.filter((cache) => !cache.active && !cache.mounted);
  const overlayCaches = reclaimableCaches.map(({ rootHash, size }) => ({ rootHash, size }));
  const mountedOverlayCaches = classifiedCaches.filter((cache) => cache.mounted)
    .map((cache) => cache.rootHash);
  const protectedOverlayCacheCount = classifiedCaches.length - overlayCaches.length;
  const cacheBytes = reclaimableCaches.reduce((total, cache) => total + cache.size, 0);
  const blobBytes = orphanBlobs.reduce((total, blob) => total + blob.size, 0);
  const inventoryCaches = classifiedCaches.map(({ rootHash, size, mounted, active }) =>
    ({ rootHash, size, mounted, active }));
  const inventory = { version: 2, workspaceId, orphanRoots, orphanBlobs,
    overlayCaches: inventoryCaches };
  return { mode: 'preview', workspaceId, inventoryHash: fingerprint(inventory),
    protectedRootCount: protectedSet.size, totalRootCount: catalog.size,
    reachableBlobCount: reachable.size, orphanRoots, orphanBlobs, overlayCaches,
    mountedOverlayCaches, protectedOverlayCacheCount,
    reclaimableBytes: blobBytes + cacheBytes,
    anomalies: [...scanned.anomalies, ...cacheScan.anomalies].sort() };
}

async function inspectGarbage(db, input, options = {}) {
  const workspace = await storage.workspace(db, input.workspaceId);
  const cacheManager = createOverlayfsCacheManager(options.overlayCacheRuntime);
  const [catalog, protectedSet, overlays, scanned, activeCaches, cacheScan] = await Promise.all([
    rootCatalog(db, input.workspaceId), protectedRoots(db, input.workspaceId),
    overlayBlobs(db, input.workspaceId), scanBlobStore(workspace.path),
    activeOverlayRoots(db, input.workspaceId), cacheManager.scan(workspace.path)
  ]);
  const reachable = new Set(overlays);
  addManifestBlobs(reachable, catalog, protectedSet);
  assertReachableBlobs(reachable, scanned);
  return inventoryReport({ workspaceId: input.workspaceId, catalog, protectedSet,
    reachable, scanned, activeCaches, cacheScan });
}

async function deleteRoot(db, input) {
  const deleted = await db.run(`DELETE FROM gqwf_roots
    WHERE workspace_id = ? AND root_hash = ?`, input.workspaceId, input.hash);
  if (deleted.changes !== 1) throw new Error('GQWF garbage inventory changed before root deletion.');
}

async function deleteBlob(workspacePath, blob) {
  const target = blobPath(workspacePath, blob.hash);
  const stat = await fs.lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== blob.size) {
    throw new Error('GQWF garbage blob changed before deletion.');
  }
  await readBlob(workspacePath, blob.hash);
  await fs.unlink(target);
}

async function persistReceipt(db, report) {
  const id = crypto.randomUUID();
  await db.run(`INSERT INTO gqwf_gc_runs
    (id, workspace_id, inventory_hash, root_count, blob_count, overlay_cache_count,
      reclaimed_bytes) VALUES (?, ?, ?, ?, ?, ?, ?)`, id, report.workspaceId,
  report.inventoryHash, report.orphanRoots.length, report.orphanBlobs.length,
  report.overlayCaches.length, report.reclaimableBytes);
  return id;
}

async function collectGarbage(db, input, options = {}) {
  if (!HASH.test(input.expectedInventoryHash || '')) {
    throw new Error('GQWF garbage collection requires a preview inventory hash.');
  }
  return withTransaction(db, async () => {
    const report = await inspectGarbage(db, input, options);
    if (report.inventoryHash !== input.expectedInventoryHash) {
      throw new Error('GQWF garbage inventory changed; run a new preview.');
    }
    if (report.anomalies.length) {
      throw new Error('GQWF garbage collection refuses anomalous blob entries or OverlayFS caches.');
    }
    const workspace = await storage.workspace(db, input.workspaceId);
    const cacheManager = createOverlayfsCacheManager(options.overlayCacheRuntime);
    for (const cache of report.overlayCaches) {
      await cacheManager.remove({ workspacePath: workspace.path,
        rootHash: cache.rootHash, size: cache.size });
    }
    for (const hash of report.orphanRoots) await deleteRoot(db, { workspaceId: input.workspaceId, hash });
    for (const blob of report.orphanBlobs) await deleteBlob(workspace.path, blob);
    const receiptId = await persistReceipt(db, report);
    return { ...report, mode: 'applied', receiptId, removedRootCount: report.orphanRoots.length,
      removedBlobCount: report.orphanBlobs.length,
      removedOverlayCacheCount: report.overlayCaches.length,
      reclaimedBytes: report.reclaimableBytes };
  });
}

module.exports = { inspectGarbage, collectGarbage };
