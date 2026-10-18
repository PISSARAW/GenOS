'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { withTransaction } = require('../../db');
const { scanBlobStore } = require('./blobInventory');
const { parseManifest } = require('./manifest');
const { blobPath } = require('./objects');
const storage = require('./storage');

const HASH = /^[a-f0-9]{64}$/;
const PROTOCOL = 'gqwf-scrub-v1';

function fingerprint(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function addReference(references, hash, size) {
  const current = references.get(hash) || { hash, sizes: new Set(), count: 0 };
  current.sizes.add(size);
  current.count += 1;
  references.set(hash, current);
}

function inspectRoots(rows, references, issues) {
  for (const row of rows) {
    try {
      const manifest = parseManifest(row.manifest_json, row.root_hash);
      for (const file of manifest.files) addReference(references, file.hash, file.size);
    } catch (_) {
      issues.push({ type: 'invalid_root', rootHash: row.root_hash });
    }
  }
}

function inspectChanges(rows, references, issues) {
  for (const row of rows) {
    const valid = HASH.test(row.blob_hash || '') && Number.isSafeInteger(row.size) && row.size >= 0;
    if (valid) addReference(references, row.blob_hash, row.size);
    else issues.push({ type: 'invalid_overlay_reference', viewId: row.view_id, path: row.path });
  }
}

async function unavailableBlobIssue(workspacePath, reference) {
  try {
    await fs.lstat(blobPath(workspacePath, reference.hash));
    return { type: 'corrupt_blob', blobHash: reference.hash };
  } catch (error) {
    return { type: error.code === 'ENOENT' ? 'missing_blob' : 'unreadable_blob',
      blobHash: reference.hash };
  }
}

async function inspectReferences(state) {
  const { workspacePath, references, scanned, issues } = state;
  const stored = new Map(scanned.blobs.map((blob) => [blob.hash, blob]));
  let verified = 0;
  for (const reference of [...references.values()].sort((left, right) =>
    left.hash.localeCompare(right.hash))) {
    const blob = stored.get(reference.hash);
    if (!blob) {
      issues.push(await unavailableBlobIssue(workspacePath, reference));
      continue;
    }
    const expectedSizes = [...reference.sizes].sort((left, right) => left - right);
    if (!reference.sizes.has(blob.size)) {
      issues.push({ type: 'size_mismatch', blobHash: reference.hash,
        expectedSizes, actualSize: blob.size });
      continue;
    }
    verified += 1;
  }
  return verified;
}

function addStoreAnomalies(scanned, references, issues) {
  for (const entry of scanned.anomalies) {
    const hash = path.basename(entry);
    const expected = HASH.test(hash) ? path.join(hash.slice(0, 2), hash) : null;
    if (!references.has(hash) || entry !== expected) {
      issues.push({ type: 'blob_store_anomaly', entry });
    }
  }
}

function buildReport(state) {
  const issues = state.issues.sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const inventory = { protocol: PROTOCOL, workspaceId: state.workspaceId,
    roots: state.roots.map((row) => row.root_hash),
    overlays: state.changes.map((row) => [row.view_id, row.path, row.blob_hash, row.size]),
    blobs: state.scanned.blobs, issues };
  return { protocol: PROTOCOL, workspaceId: state.workspaceId,
    status: issues.length ? 'corrupt' : 'healthy', inventoryHash: fingerprint(inventory),
    rootCount: state.roots.length, overlayChangeCount: state.changes.length,
    storedBlobCount: state.scanned.blobs.length,
    referencedBlobCount: state.references.size, verifiedBlobCount: state.verified,
    unreferencedBlobCount: state.scanned.blobs.filter((blob) =>
      !state.references.has(blob.hash)).length,
    issueCount: issues.length, issues };
}

async function inspect(db, workspaceId) {
  const workspace = await storage.workspace(db, workspaceId);
  const [roots, changes, scanned] = await Promise.all([
    db.all(`SELECT root_hash, manifest_json FROM gqwf_roots
      WHERE workspace_id = ? ORDER BY root_hash`, workspaceId),
    db.all(`SELECT c.view_id, c.path, c.blob_hash, c.size FROM gqwf_changes c
      JOIN gqwf_views v ON v.id = c.view_id
      WHERE v.workspace_id = ? AND c.deleted = 0 ORDER BY c.view_id, c.path`, workspaceId),
    scanBlobStore(workspace.path)
  ]);
  const references = new Map();
  const issues = [];
  inspectRoots(roots, references, issues);
  inspectChanges(changes, references, issues);
  const verified = await inspectReferences({ workspacePath: workspace.path,
    references, scanned, issues });
  addStoreAnomalies(scanned, references, issues);
  return buildReport({ workspaceId, roots, changes, scanned, references, verified, issues });
}

async function persist(db, report) {
  const receiptId = crypto.randomUUID();
  await db.run(`INSERT INTO gqwf_integrity_runs
    (id, workspace_id, protocol, inventory_hash, status, root_count, blob_count,
      issue_count, report_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  receiptId, report.workspaceId, report.protocol, report.inventoryHash, report.status,
  report.rootCount, report.referencedBlobCount, report.issueCount, JSON.stringify(report));
  return receiptId;
}

async function scrubIntegrity(db, input) {
  return withTransaction(db, async () => {
    const report = await inspect(db, input.workspaceId);
    const receiptId = await persist(db, report);
    return { ...report, receiptId };
  });
}

module.exports = { scrubIntegrity };
