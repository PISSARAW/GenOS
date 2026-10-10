'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { migrateGqwf } = require('./schema');
const { importLegacySnapshot } = require('./legacy');
const { readBlob } = require('./objects');
const snapshots = require('../workspaceSnapshotStore');
const { collectFiles } = require('../workspaceSnapshotCollect');
const { assertNoSymlinkPath, sanitizeFileMode } = require('../workspaceSnapshotPaths');
const { verifyContentHash } = require('../workspaceSnapshotMaterialize');
const storage = require('./storage');

function invalidReference() {
  return Object.assign(new Error('GQWF snapshot reference is missing or inconsistent.'),
    { code: 'ORGANISM_GQWF_REFERENCE_INVALID', status: 409 });
}

async function captureReference(db, snapshot) {
  await migrateGqwf(db);
  const imported = await importLegacySnapshot(db, {
    workspaceId: snapshot.workspaceId, reference: snapshot.id
  });
  if (imported.legacyHash !== snapshot.hash) {
    throw new Error('GQWF root does not match the captured workspace snapshot.');
  }
  return imported.rootHash;
}

async function verifyReference(db, snapshot) {
  if (!snapshot?.gqwfRootHash) return;
  const row = await db.get(`SELECT legacy_hash, root_hash FROM gqwf_legacy_links
    WHERE workspace_id = ? AND snapshot_id = ?`, snapshot.workspaceId, snapshot.id);
  if (row?.legacy_hash !== snapshot.hash || row.root_hash !== snapshot.gqwfRootHash) {
    throw invalidReference();
  }
  try {
    await storage.root(db, snapshot.workspaceId, snapshot.gqwfRootHash);
  } catch (_) {
    throw invalidReference();
  }
}

function assertSameProjection(legacy, root) {
  const identity = (files) => files.map((file) => `${file.path}\0${file.hash}\0${file.size}`).sort();
  if (JSON.stringify(identity(legacy.files)) !== JSON.stringify(identity(root.files))) {
    throw invalidReference();
  }
}

async function materializeFile(workspacePath, destination, file) {
  await assertNoSymlinkPath(workspacePath, `.genos/gqwf/blobs/${file.hash.slice(0, 2)}/${file.hash}`);
  const bytes = await readBlob(workspacePath, file.hash);
  if (bytes.length !== file.size) throw invalidReference();
  const target = await assertNoSymlinkPath(destination, file.path);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(await assertNoSymlinkPath(destination, file.path), bytes, { flag: 'wx' });
  await fs.chmod(target, sanitizeFileMode(file.mode, file.path, bytes));
}

async function materializeReference(options) {
  const { db, workspace, reference, target, destination } = options;
  await verifyReference(db, reference);
  const legacy = await snapshots.readManifest(target);
  const root = await storage.root(db, workspace.id, reference.gqwfRootHash);
  assertSameProjection(legacy, root);
  for (const file of root.files) await materializeFile(workspace.path, destination, file);
  verifyContentHash(await collectFiles(destination), root.files, 'GQWF materialization checksum mismatch.');
  return root;
}

module.exports = { captureReference, verifyReference, materializeReference };
