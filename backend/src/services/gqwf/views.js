'use strict';

const crypto = require('node:crypto');
const { withTransaction } = require('../../db');
const { snapshotLimits } = require('../workspaceSnapshotCollect');
const { sanitizeFileMode } = require('../workspaceSnapshotPaths');
const { createManifest, normalizePath } = require('./manifest');
const { putBlob, readBlob, sha256 } = require('./objects');
const storage = require('./storage');

async function createView(db, input) {
  await storage.root(db, input.workspaceId, input.baseHash);
  const id = crypto.randomUUID();
  await db.run('INSERT INTO gqwf_views (id, workspace_id, base_hash) VALUES (?, ?, ?)',
    id, input.workspaceId, input.baseHash);
  return { id, workspaceId: input.workspaceId, baseHash: input.baseHash, version: 0 };
}

async function filesForView(db, input) {
  const current = await storage.view(db, input.workspaceId, input.viewId);
  const base = await storage.root(db, input.workspaceId, current.base_hash);
  const files = new Map(base.files.map((file) => [file.path, file]));
  for (const change of await storage.changes(db, input.viewId)) {
    if (change.deleted) files.delete(change.path);
    else files.set(change.path, { path: change.path, hash: change.blob_hash,
      size: change.size, mode: change.mode });
  }
  return { current, files };
}

async function listFiles(db, input) {
  const { current, files } = await filesForView(db, input);
  return { version: current.overlay_version, files: createManifest([...files.values()]).manifest.files };
}

async function readFile(db, input) {
  const filePath = normalizePath(input.path);
  const { files } = await filesForView(db, input);
  const entry = files.get(filePath);
  if (!entry) throw new Error(`GQWF file not found: ${filePath}`);
  const workspace = await storage.workspace(db, input.workspaceId);
  const bytes = await readBlob(workspace.path, entry.hash);
  if (bytes.length !== entry.size) throw new Error('GQWF file size mismatch.');
  return bytes;
}

async function writeFile(db, input) {
  const filePath = normalizePath(input.path);
  if (!Buffer.isBuffer(input.content) && typeof input.content !== 'string') {
    throw new TypeError('GQWF content must be a Buffer or string.');
  }
  const bytes = Buffer.isBuffer(input.content) ? input.content : Buffer.from(input.content, 'utf8');
  if (bytes.length > snapshotLimits().maxFileBytes) throw new Error('GQWF file exceeds the size limit.');
  const { current, files } = await filesForView(db, input);
  if (current.overlay_version !== input.expectedVersion) throw new Error('GQWF overlay version conflict.');
  const mode = sanitizeFileMode(input.mode ?? 0o644, filePath, bytes);
  files.set(filePath, { path: filePath, hash: sha256(bytes), size: bytes.length, mode });
  createManifest([...files.values()]);
  const workspace = await storage.workspace(db, input.workspaceId);
  const hash = await putBlob(workspace.path, bytes);
  return storage.mutateView(db, { workspaceId: input.workspaceId, viewId: input.viewId,
    expectedVersion: input.expectedVersion, path: filePath, hash, size: bytes.length, mode, deleted: false });
}

async function deleteFile(db, input) {
  const filePath = normalizePath(input.path);
  const { current, files } = await filesForView(db, input);
  if (current.overlay_version !== input.expectedVersion) throw new Error('GQWF overlay version conflict.');
  if (!files.has(filePath)) throw new Error(`GQWF file not found: ${filePath}`);
  return storage.mutateView(db, { workspaceId: input.workspaceId, viewId: input.viewId,
    expectedVersion: input.expectedVersion, path: filePath, hash: null, size: null, mode: null, deleted: true });
}

async function sealView(db, input) {
  return withTransaction(db, async () => {
    const { current, files } = await filesForView(db, input);
    if (current.overlay_version !== input.expectedVersion) throw new Error('GQWF overlay version conflict.');
    const built = createManifest([...files.values()]);
    await storage.putRoot(db, input.workspaceId, built);
    return { rootHash: built.hash, viewId: input.viewId, version: current.overlay_version };
  });
}

module.exports = { createView, filesForView, listFiles, readFile, writeFile, deleteFile, sealView };
