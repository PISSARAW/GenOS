/**
 * Snapshot materialization + restore file copy (split of workspaceSnapshotStore.js).
 *
 * Mode-bits fix: files are chmodded through sanitizeFileMode — setuid/setgid/
 * sticky are always stripped and +x is granted only under `bin/` directories
 * or to shebang (`#!`) scripts; everything else restores as non-executable.
 */
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { isSafeRelative, assertNoSymlinkPath, shouldIgnore, snapshotRoot, sanitizeFileMode, readShebangPrefix } = require('./workspaceSnapshotPaths');
const { collectFiles, manifestHash, sha256, snapshotLimits } = require('./workspaceSnapshotCollect');

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
}

async function loadManifestDocument(snapshot) {
  const metadata = parseMetadata(snapshot.metadata);
  const manifestPath = metadata.manifestPath || path.join(metadata.storagePath || '', 'manifest.json');
  if (!manifestPath) throw new Error(`Snapshot ${snapshot.id} has no durable manifest reference.`);
  if (snapshot.workspace_path) {
    const expectedRoot = snapshotRoot(snapshot.workspace_path, snapshot.workspace_id);
    const realRoot = await fsp.realpath(expectedRoot);
    const realManifest = await fsp.realpath(manifestPath);
    const relativeManifest = path.relative(realRoot, realManifest);
    if (relativeManifest.startsWith(`..${path.sep}`) || relativeManifest === '..' || path.isAbsolute(relativeManifest)) {
      throw new Error(`Snapshot ${snapshot.id} manifest is outside its snapshot root.`);
    }
  }
  if (!fs.existsSync(manifestPath)) {
    console.error('[readManifest ENOENT debug]', {
      manifestPath,
      parentExists: fs.existsSync(path.dirname(manifestPath)),
      grandparentExists: fs.existsSync(path.dirname(path.dirname(manifestPath))),
      rootExists: fs.existsSync(path.dirname(path.dirname(path.dirname(manifestPath)))),
      snapshotId: snapshot.id
    });
  }
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  return { manifest, manifestPath };
}

function validateManifestDocument(snapshot, manifest) {
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error(`Snapshot ${snapshot.id} has an invalid manifest format.`);
  if (manifest.hash !== snapshot.snapshot_hash) throw new Error(`Snapshot ${snapshot.id} failed manifest hash validation.`);
  if (manifestHash(manifest.files || []) !== manifest.hash) throw new Error(`Snapshot ${snapshot.id} has a corrupted manifest.`);
}

function assertManifestFileEntry(snapshot, file, paths) {
  if (!file || !isSafeRelative(file.path) || paths.has(file.path) || !/^[a-f0-9]{64}$/.test(file.hash) || !Number.isSafeInteger(file.size) || file.size < 0) {
    throw new Error(`Snapshot ${snapshot.id} contains an invalid file entry.`);
  }
  paths.add(file.path);
}

async function readManifest(snapshot) {
  const loaded = await loadManifestDocument(snapshot);
  validateManifestDocument(snapshot, loaded.manifest);
  const limits = snapshotLimits();
  const paths = new Set();
  let totalBytes = 0;
  for (const file of loaded.manifest.files) {
    assertManifestFileEntry(snapshot, file, paths);
    totalBytes += file.size;
    if (loaded.manifest.files.length > limits.maxFiles || file.size > limits.maxFileBytes || totalBytes > limits.maxBytes) {
      throw new Error(`Snapshot ${snapshot.id} exceeds the configured size limits.`);
    }
  }
  return { ...loaded.manifest, payloadRoot: path.join(path.dirname(loaded.manifestPath), 'files') };
}

async function loadSnapshotRow(db, workspaceId, reference) {
  const numeric = Number(reference);
  if (Number.isInteger(numeric) && String(reference).trim() !== '') {
    return db.get('SELECT s.*, w.path AS workspace_path FROM workspace_snapshots s JOIN workspaces w ON w.id = s.workspace_id WHERE s.workspace_id = ? AND s.step_number = ? ORDER BY s.created_at DESC LIMIT 1', workspaceId, numeric);
  }
  return db.get('SELECT s.*, w.path AS workspace_path FROM workspace_snapshots s JOIN workspaces w ON w.id = s.workspace_id WHERE s.workspace_id = ? AND (s.id = ? OR s.snapshot_hash = ?) ORDER BY s.created_at DESC LIMIT 1', workspaceId, reference, reference);
}

async function getSnapshot(db, workspaceId, reference) {
  const row = await loadSnapshotRow(db, workspaceId, reference);
  if (!row) throw new Error(`Snapshot not found: ${reference}`);
  return row;
}

function withoutMode(files) {
  return files.map((file) => ({ path: file.path, hash: file.hash, size: file.size }));
}

// Content integrity ignores permission bits: sanitizeFileMode intentionally
// transforms modes at restore time, so the final check compares path/hash/size.
function verifyContentHash(collected, expected, message) {
  if (manifestHash(withoutMode(collected)) !== manifestHash(withoutMode(expected))) {
    throw new Error(message);
  }
}

async function materializeFile(options) {
  const { manifest, file, destination } = options;
  if (!isSafeRelative(file.path)) throw new Error(`Snapshot manifest contains an unsafe path: ${file.path}`);
  const source = await assertNoSymlinkPath(manifest.payloadRoot, file.path);
  const target = await assertNoSymlinkPath(destination, file.path);
  const bytes = await fsp.readFile(source);
  if (sha256(bytes) !== file.hash) throw new Error(`Snapshot payload checksum mismatch for ${file.path}.`);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.writeFile(target, bytes);
  await fsp.chmod(target, sanitizeFileMode(file.mode, file.path, bytes));
}

async function materialize(snapshot, destination) {
  const manifest = await readManifest(snapshot);
  await fsp.mkdir(destination, { recursive: true });
  for (const file of manifest.files) {
    await materializeFile({ manifest, file, destination });
  }
  verifyContentHash(await collectFiles(destination), manifest.files, `Snapshot materialization checksum mismatch for ${destination}.`);
  return manifest;
}

async function visitWorkspaceEntry(state, entry) {
  const relative = path.relative(state.workspacePath, path.join(state.directory, entry.name));
  if (shouldIgnore(relative, entry)) return;
  const absolute = path.join(state.directory, entry.name);
  if (entry.isSymbolicLink()) {
    await fsp.rm(absolute, { recursive: true, force: true });
    return;
  }
  if (entry.isDirectory() && !entry.isSymbolicLink()) {
    await walkWorkspaceDirectories(state.workspacePath, absolute, state.directories);
    state.directories.push(absolute);
  }
}

async function walkWorkspaceDirectories(workspacePath, directory, directories) {
  const state = { workspacePath, directory, directories };
  for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
    await visitWorkspaceEntry(state, entry);
  }
}

async function collectWorkspaceDirectories(workspacePath) {
  const directories = [];
  await walkWorkspaceDirectories(workspacePath, workspacePath, directories);
  return directories;
}

async function removeWorkspaceFiles(workspacePath) {
  const current = await collectFiles(workspacePath);
  for (const file of current) await fsp.rm(path.join(workspacePath, file.path), { force: true });
  const directories = await collectWorkspaceDirectories(workspacePath);
  for (const directory of directories.sort((a, b) => b.length - a.length)) await fsp.rm(directory, { recursive: true, force: true });
}

async function copyMaterializedFile(options) {
  const { sourceRoot, file, destination } = options;
  const source = await assertNoSymlinkPath(sourceRoot, file.path);
  const target = await assertNoSymlinkPath(destination, file.path);
  await fsp.mkdir(path.dirname(target), { recursive: true });
  await fsp.copyFile(source, target);
  await fsp.chmod(target, sanitizeFileMode(file.mode, file.path, await readShebangPrefix(target))).catch(() => {});
}

async function copyMaterializedFiles(sourceRoot, files, destination) {
  for (const file of files) {
    await copyMaterializedFile({ sourceRoot, file, destination });
  }
}

module.exports = {
  parseMetadata,
  readManifest,
  getSnapshot,
  materialize,
  removeWorkspaceFiles,
  copyMaterializedFiles,
  verifyContentHash
};
