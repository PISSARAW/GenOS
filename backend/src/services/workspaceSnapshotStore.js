/**
 * Durable filesystem snapshots for Studio workspaces.
 *
 * The SQLite row is the index; the manifest and copied files are the durable
 * payload. Files are addressed by a SHA-256 manifest so identical snapshots
 * share one payload directory. Snapshot capture never follows symlinks and
 * deliberately excludes build/dependency directories.
 */

const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const IGNORED_DIRECTORIES = new Set(['.git', '.genos', 'node_modules', 'target', 'dist', 'coverage', '.next']);
const IGNORED_FILES = new Set(['genos.db', 'genos.db-shm', 'genos.db-wal']);
const SENSITIVE_FILES = /^(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx)|credentials(?:\..*)?|secrets?(?:\..*)?)$/i;

function snapshotRoot(workspacePath, workspaceId) {
  const configured = process.env.GENOS_SNAPSHOT_ROOT;
  return configured
    ? path.resolve(configured, String(workspaceId || 'workspace'))
    : path.resolve(workspacePath, '.genos', 'workspace-snapshots');
}

function isSafeRelative(relativePath) {
  return relativePath && relativePath !== '.' && !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function shouldIgnore(relativePath, entry) {
  const parts = relativePath.split(path.sep);
  return parts.some((part) => IGNORED_DIRECTORIES.has(part)) || IGNORED_FILES.has(entry.name) || entry.name.startsWith('genos.db') || SENSITIVE_FILES.test(entry.name);
}

async function collectFiles(root) {
  const files = [];
  async function walk(directory, relative = '') {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const childRelative = relative ? path.join(relative, entry.name) : entry.name;
      if (shouldIgnore(childRelative, entry)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(absolute, childRelative);
      else if (entry.isFile() && isSafeRelative(childRelative)) {
        const bytes = await fsp.readFile(absolute);
        const stat = await fsp.stat(absolute);
        files.push({ path: childRelative.split(path.sep).join('/'), hash: sha256(bytes), size: stat.size, mode: stat.mode & 0o777 });
      }
    }
  }
  await walk(root);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function manifestHash(files) {
  return sha256(JSON.stringify(files));
}

async function copyManifestPayload(workspacePath, root, hash, files) {
  const payloadRoot = path.join(root, hash, 'files');
  if (await exists(path.join(root, hash, 'manifest.json'))) return payloadRoot;
  const staging = await fsp.mkdtemp(path.join(root, `.snapshot-${hash.slice(0, 12)}-`));
  try {
    for (const file of files) {
      const source = path.join(workspacePath, file.path);
      const destination = path.join(staging, 'files', file.path);
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      await fsp.copyFile(source, destination);
      const copied = await fsp.readFile(destination);
      if (sha256(copied) !== file.hash || copied.length !== file.size) {
        throw new Error(`Workspace changed while snapshotting ${file.path}; capture aborted.`);
      }
      await fsp.chmod(destination, file.mode).catch(() => {});
    }
    await fsp.writeFile(path.join(staging, 'manifest.json'), JSON.stringify({ version: 1, hash, files }, null, 2));
    await fsp.rename(staging, path.join(root, hash));
    return payloadRoot;
  } catch (error) {
    await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
    if (['EEXIST', 'ENOTEMPTY'].includes(error.code) && await exists(path.join(root, hash, 'manifest.json'))) return payloadRoot;
    throw error;
  }
}

async function exists(filePath) {
  try { await fsp.access(filePath); return true; } catch (_) { return false; }
}

async function readManifest(snapshot) {
  const metadata = parseMetadata(snapshot.metadata);
  const manifestPath = metadata.manifestPath || path.join(metadata.storagePath || '', 'manifest.json');
  if (!manifestPath) throw new Error(`Snapshot ${snapshot.id} has no durable manifest reference.`);
  const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error(`Snapshot ${snapshot.id} has an invalid manifest format.`);
  if (manifest.hash !== snapshot.snapshot_hash) throw new Error(`Snapshot ${snapshot.id} failed manifest hash validation.`);
  if (manifestHash(manifest.files || []) !== manifest.hash) throw new Error(`Snapshot ${snapshot.id} has a corrupted manifest.`);
  const paths = new Set();
  for (const file of manifest.files) {
    if (!file || !isSafeRelative(file.path) || paths.has(file.path) || !/^[a-f0-9]{64}$/.test(file.hash) || !Number.isSafeInteger(file.size) || file.size < 0) {
      throw new Error(`Snapshot ${snapshot.id} contains an invalid file entry.`);
    }
    paths.add(file.path);
  }
  return { ...manifest, payloadRoot: path.join(path.dirname(manifestPath), 'files') };
}

function parseMetadata(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  try { return JSON.parse(value); } catch (_) { return {}; }
}

async function capture({ db, workspace, label = 'Workspace snapshot', reason = 'Manual snapshot', author = 'studio' }) {
  if (!workspace?.path || !fs.existsSync(workspace.path)) throw new Error(`Workspace path does not exist: ${workspace?.path || '<empty>'}`);
  const root = snapshotRoot(workspace.path, workspace.id);
  await fsp.mkdir(root, { recursive: true });
  const files = await collectFiles(workspace.path);
  const hash = manifestHash(files);
  await copyManifestPayload(workspace.path, root, hash, files);
  const id = `snp-${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}`;
  const manifestPath = path.join(root, hash, 'manifest.json');
  const metadata = { storage: 'durable-filesystem', manifestPath, storagePath: path.join(root, hash), fileCount: files.length, hashAlgorithm: 'sha256' };
  await db.run(
    `INSERT INTO workspace_snapshots (id, workspace_id, snapshot_hash, step_number, label, author, reason, diff_summary, metadata)
     SELECT ?, ?, ?, COALESCE(MAX(step_number), 0) + 1, ?, ?, ?, ?, ? FROM workspace_snapshots WHERE workspace_id = ?`,
    id, workspace.id, hash, label, author, reason, JSON.stringify({ fileCount: files.length }), JSON.stringify(metadata), workspace.id
  );
  const inserted = await db.get('SELECT step_number FROM workspace_snapshots WHERE id = ?', id);
  const step = inserted.step_number;
  return { id, workspaceId: workspace.id, snapshotHash: hash, stepNumber: step, label, reason, metadata, fileCount: files.length };
}

async function getSnapshot(db, workspaceId, reference) {
  const numeric = Number(reference);
  const row = Number.isInteger(numeric) && String(reference).trim() !== ''
    ? await db.get('SELECT * FROM workspace_snapshots WHERE workspace_id = ? AND step_number = ? ORDER BY created_at DESC LIMIT 1', workspaceId, numeric)
    : await db.get('SELECT * FROM workspace_snapshots WHERE workspace_id = ? AND (id = ? OR snapshot_hash = ?) ORDER BY created_at DESC LIMIT 1', workspaceId, reference, reference);
  if (!row) throw new Error(`Snapshot not found: ${reference}`);
  return row;
}

async function materialize(snapshot, destination) {
  const manifest = await readManifest(snapshot);
  await fsp.mkdir(destination, { recursive: true });
  for (const file of manifest.files) {
    if (!isSafeRelative(file.path)) throw new Error(`Snapshot manifest contains an unsafe path: ${file.path}`);
    const source = path.join(manifest.payloadRoot, file.path);
    const target = path.join(destination, file.path);
    const bytes = await fsp.readFile(source);
    if (sha256(bytes) !== file.hash) throw new Error(`Snapshot payload checksum mismatch for ${file.path}.`);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, bytes);
    await fsp.chmod(target, file.mode).catch(() => {});
  }
  return manifest;
}

async function removeWorkspaceFiles(workspacePath) {
  const current = await collectFiles(workspacePath);
  for (const file of current) await fsp.rm(path.join(workspacePath, file.path), { force: true });
  const directories = [];
  async function walk(directory) {
    for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
      const relative = path.relative(workspacePath, path.join(directory, entry.name));
      if (shouldIgnore(relative, entry)) continue;
      if (entry.isDirectory() && !entry.isSymbolicLink()) { await walk(path.join(directory, entry.name)); directories.push(path.join(directory, entry.name)); }
    }
  }
  await walk(workspacePath);
  for (const directory of directories.sort((a, b) => b.length - a.length)) await fsp.rm(directory, { recursive: true, force: true });
}

async function restore({ db, workspace, reference, author = 'studio' }) {
  const target = await getSnapshot(db, workspace.id, reference);
  const backup = await capture({ db, workspace, label: 'Pre-restore safety snapshot', reason: `Before restoring ${target.id}`, author });
  const staging = await fsp.mkdtemp(path.join(os.tmpdir(), 'genos-restore-'));
  try {
    await materialize(target, staging);
    await removeWorkspaceFiles(workspace.path);
    const verified = await readManifest(target);
    for (const file of verified.files) {
      const source = path.join(staging, file.path);
      const destination = path.join(workspace.path, file.path);
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      await fsp.copyFile(source, destination);
      await fsp.chmod(destination, file.mode).catch(() => {});
    }
    return { success: true, restoredSnapshot: target, safetySnapshot: backup };
  } catch (error) {
    try {
      await removeWorkspaceFiles(workspace.path);
      await materialize({ metadata: backup.metadata, snapshot_hash: backup.snapshotHash, id: backup.id }, workspace.path);
    } catch (rollbackError) {
      error.message += ` Recovery snapshot restore also failed: ${rollbackError.message}`;
    }
    throw error;
  } finally {
    await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
  }
}

async function preview({ db, workspace, reference }) {
  const target = await getSnapshot(db, workspace.id, reference);
  const manifest = await readManifest(target);
  const current = await collectFiles(workspace.path);
  const currentByPath = new Map(current.map((file) => [file.path, file]));
  const targetByPath = new Map(manifest.files.map((file) => [file.path, file]));
  const affectedFiles = [...new Set([...currentByPath.keys(), ...targetByPath.keys()])].filter((file) => currentByPath.get(file)?.hash !== targetByPath.get(file)?.hash).sort();
  const reversePatch = affectedFiles.map((file) => {
    const from = currentByPath.get(file)?.hash || '<absent>';
    const to = targetByPath.get(file)?.hash || '<absent>';
    return `${file}\n  current: ${from}\n  restore: ${to}`;
  }).join('\n') || 'No file changes; restore is a no-op.';
  return { targetSnapshot: { ...target, metadata: parseMetadata(target.metadata) }, affectedFiles, reversePatch, affectedFilesCount: affectedFiles.length, durable: true };
}

async function runInSnapshot({ snapshot, command, timeoutMs = 30000, maxOutputBytes = 1024 * 1024 }) {
  if (!String(command || '').trim()) throw new Error('A test command is required.');
  const runnerRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'genos-test-run-'));
  const workingDirectory = path.join(runnerRoot, 'workspace');
  try {
    await materialize(snapshot, workingDirectory);
    const { spawn } = require('child_process');
    const output = await new Promise((resolve, reject) => {
      const child = spawn('/bin/sh', ['-c', String(command)], {
        cwd: workingDirectory,
        env: { PATH: process.env.PATH || '/usr/bin:/bin', CI: '1', GENOS_ISOLATED_RUNNER: '1', TMPDIR: runnerRoot },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let stdout = ''; let stderr = ''; let truncated = false;
      const append = (target, chunk) => {
        const value = target + chunk.toString('utf8');
        if (Buffer.byteLength(value) > maxOutputBytes) { truncated = true; return value.slice(0, maxOutputBytes); }
        return value;
      };
      child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
      child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
      const timer = setTimeout(() => { child.kill('SIGKILL'); reject(Object.assign(new Error(`Test command timed out after ${timeoutMs}ms.`), { code: 'TEST_TIMEOUT' })); }, timeoutMs);
      child.on('error', (error) => { clearTimeout(timer); reject(error); });
      child.on('close', (code, signal) => { clearTimeout(timer); resolve({ exitCode: code == null ? -1 : code, signal, stdout, stderr, truncated }); });
    });
    return { ...output, snapshotId: snapshot.id, snapshotHash: snapshot.snapshot_hash };
  } finally {
    await fsp.rm(runnerRoot, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { capture, getSnapshot, readManifest, materialize, restore, preview, runInSnapshot, collectFiles, snapshotRoot };
