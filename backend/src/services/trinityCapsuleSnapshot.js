const fs = require('fs/promises');
const path = require('path');
const secure = require('./trinityCapsulePaths');
const snapshotPaths = require('./workspaceSnapshotPaths');
const { manifestHash, sha256, snapshotLimits } = require('./workspaceSnapshotCollect');

async function readManifest(target) {
  const manifestPath = secure.assertPath(path.join(target, 'manifest.json'));
  const stat = await fs.lstat(manifestPath);
  if (!stat.isFile() || stat.size > 32 * 1024 * 1024) secure.fail('Invalid snapshot manifest file.');
  return JSON.parse(await fs.readFile(manifestPath, 'utf8'));
}

function fileEntry(file, known) {
  if (!file || !snapshotPaths.isSafeRelative(file.path)) secure.fail('Invalid snapshot payload path.');
  if (file.path.includes('\\') || file.path.includes(':')) secure.fail('Invalid snapshot payload path.');
  const key = process.platform === 'win32' ? file.path.toLowerCase() : file.path;
  if (known.has(key)) secure.fail('Duplicate snapshot payload path.');
  if (!/^[a-f0-9]{64}$/.test(file.hash)) secure.fail('Invalid snapshot file hash.');
  if (!Number.isSafeInteger(file.size) || file.size < 0) secure.fail('Invalid snapshot file size.');
  known.add(key);
}

function validateManifest(manifest, hash) {
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) secure.fail('Invalid snapshot manifest shape.');
  if (manifest.hash !== hash || manifestHash(manifest.files) !== hash) secure.fail('Snapshot manifest hash mismatch.');
  const limits = snapshotLimits();
  if (manifest.files.length > limits.maxFiles) secure.fail('Snapshot file count exceeds its limit.');
  const known = new Set();
  let total = 0;
  for (const file of manifest.files) {
    fileEntry(file, known);
    total += file.size;
    if (file.size > limits.maxFileBytes || total > limits.maxBytes) secure.fail('Snapshot byte count exceeds its limit.');
  }
}

function allowedDirectories(files) {
  const result = new Set();
  for (const file of files) {
    let parent = path.posix.dirname(file.path);
    while (parent !== '.') { result.add(parent); parent = path.posix.dirname(parent); }
  }
  return result;
}

async function inspectEntry(payload, item, expected) {
  const absolute = secure.assertPath(snapshotPaths.containedJoin(payload, item.relative));
  const stat = await fs.lstat(absolute);
  if (stat.isFile()) {
    if (!expected.files.has(item.relative)) secure.fail('Snapshot contains an undeclared file.');
    return null;
  }
  if (!stat.isDirectory() || !expected.directories.has(item.relative)) secure.fail('Snapshot contains an undeclared directory.');
  return item.relative;
}

async function verifyInventory(payload, files) {
  const expected = { files: new Set(files.map(file => file.path)), directories: allowedDirectories(files) };
  const pending = [''];
  while (pending.length) {
    const relative = pending.pop();
    let entries;
    try { entries = await fs.readdir(secure.assertPath(path.join(payload, relative))); }
    catch (error) { if (error.code === 'ENOENT' && files.length === 0) return; throw error; }
    for (const name of entries) {
      const child = relative ? relative + '/' + name : name;
      const directory = await inspectEntry(payload, { relative: child }, expected);
      if (directory) pending.push(directory);
    }
  }
}

async function verify(root, hash) {
  const target = secure.assertPath(secure.contained(root, path.join(root, hash)));
  const manifest = await readManifest(target);
  validateManifest(manifest, hash);
  const payload = secure.assertPath(path.join(target, 'files'));
  await verifyInventory(payload, manifest.files);
  for (const file of manifest.files) {
    if (!snapshotPaths.isSafeRelative(file.path)) secure.fail('Invalid snapshot payload path.');
    const absolute = secure.assertPath(snapshotPaths.containedJoin(payload, file.path));
    const bytes = await fs.readFile(absolute);
    if (bytes.length !== file.size || sha256(bytes) !== file.hash) secure.fail('Snapshot payload was altered.');
  }
  return payload;
}

module.exports = { verify };
