/**
 * Snapshot payload publishing + capture (split of workspaceSnapshotStore.js).
 */
const crypto = require('crypto');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { snapshotRoot, containedJoin, assertNoSymlinkPath, exists } = require('./workspaceSnapshotPaths');
const { collectFiles, manifestHash, sha256 } = require('./workspaceSnapshotCollect');

function isBusyRenameError(error) {
  return error && ['EEXIST', 'ENOTEMPTY', 'EPERM', 'EBUSY'].includes(error.code);
}

async function stagePayloadFile(workspacePath, staging, file) {
  const source = await assertNoSymlinkPath(workspacePath, file.path);
  const destination = containedJoin(staging, path.join('files', file.path));
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  await fsp.copyFile(source, destination);
  const copied = await fsp.readFile(destination);
  if (sha256(copied) !== file.hash || copied.length !== file.size) {
    throw new Error(`Workspace changed while snapshotting ${file.path}; capture aborted.`);
  }
  await fsp.chmod(destination, file.mode);
}

async function stagePayloadFiles(workspacePath, staging, files) {
  for (const file of files) {
    await stagePayloadFile(workspacePath, staging, file);
  }
}

async function recoverPayloadRename(options) {
  const { root, hash, staging, targetDir, payloadRoot, renameErr } = options;
  if (!isBusyRenameError(renameErr)) throw renameErr;
  if (await exists(path.join(targetDir, 'manifest.json'))) {
    await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
    return payloadRoot;
  }
  await fsp.cp(staging, targetDir, { recursive: true, force: true });
  await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
  if (await exists(path.join(targetDir, 'manifest.json'))) return payloadRoot;
  throw renameErr;
}

async function publishPayloadStaging(options) {
  const { root, hash, staging, payloadRoot, manifestData, files } = options;
  const manifestJson = manifestData ? { ...manifestData, version: 1, hash, files } : { version: 1, hash, files };
  await fsp.writeFile(path.join(staging, 'manifest.json'), JSON.stringify(manifestJson, null, 2));
  const targetDir = path.join(root, hash);
  try {
    await fsp.rename(staging, targetDir);
  } catch (renameErr) {
    await recoverPayloadRename({ root, hash, staging, targetDir, payloadRoot, renameErr });
  }
  return payloadRoot;
}

async function copyManifestPayload(options) {
  const { workspacePath, root, hash, files, manifestData } = options;
  const payloadRoot = path.join(root, hash, 'files');
  if (await exists(path.join(root, hash, 'manifest.json'))) return payloadRoot;
  const staging = await fsp.mkdtemp(path.join(root, `.snapshot-${hash.slice(0, 12)}-`));
  try {
    await stagePayloadFiles(workspacePath, staging, files);
    await publishPayloadStaging({ root, hash, staging, payloadRoot, manifestData, files });
    return payloadRoot;
  } catch (error) {
    await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
    if (isBusyRenameError(error) && await exists(path.join(root, hash, 'manifest.json'))) return payloadRoot;
    throw error;
  }
}

async function pruneSnapshotEntry(root, entry, spec) {
  if (!entry.isDirectory()) return false;
  const entryPath = path.join(root, entry.name);
  const stat = await fsp.stat(entryPath);
  const abandonedStaging = entry.name.startsWith('.snapshot-') && stat.mtimeMs < spec.cutoff;
  const orphanedPayload = /^[a-f0-9]{64}$/.test(entry.name) && !spec.referenced.has(entry.name) && stat.mtimeMs < spec.cutoff;
  if (!abandonedStaging && !orphanedPayload) return false;
  await fsp.rm(entryPath, { recursive: true, force: true });
  return true;
}

async function pruneSnapshotArtifacts({ db, workspaceId, workspacePath, maxAgeMs = 60 * 60 * 1000 }) {
  const root = snapshotRoot(workspacePath, workspaceId);
  if (!(await exists(root))) return { removed: 0 };
  const referenced = new Set((await db.all('SELECT snapshot_hash FROM workspace_snapshots WHERE workspace_id = ?', workspaceId)).map((row) => row.snapshot_hash));
  const cutoff = Date.now() - Math.max(0, Number(maxAgeMs) || 0);
  let removed = 0;
  for (const entry of await fsp.readdir(root, { withFileTypes: true })) {
    if (await pruneSnapshotEntry(root, entry, { referenced, cutoff })) removed += 1;
  }
  return { removed };
}

async function reconcileSnapshotArtifacts(db, maxAgeMs = 60 * 60 * 1000) {
  if (!db || typeof db.all !== 'function') throw new Error('A database handle is required for snapshot artifact reconciliation.');
  const workspaces = await db.all('SELECT id, path FROM workspaces WHERE path IS NOT NULL AND path != \'\'');
  let removed = 0;
  for (const workspace of workspaces) {
    removed += (await pruneSnapshotArtifacts({ db, workspaceId: workspace.id, workspacePath: workspace.path, maxAgeMs })).removed;
  }
  return { workspaces: workspaces.length, removed };
}

async function resolveGitCommit(workspacePath) {
  const { spawn } = require('child_process');
  const { appendBounded } = require('./boundedOutput');
  return new Promise((resolve) => {
    const child = spawn('git', ['-C', workspacePath, 'rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout = appendBounded(stdout, chunk); });
    child.on('close', (code) => resolve(code === 0 ? stdout.trim() : null));
    child.on('error', () => resolve(null));
  });
}

async function verifyStableWorkspace(options) {
  const { db, workspacePath, root, hash } = options;
  const finalFiles = await collectFiles(workspacePath);
  if (manifestHash(finalFiles) === hash) return;
  const reference = await db.get('SELECT 1 FROM workspace_snapshots WHERE snapshot_hash = ? LIMIT 1').catch(() => null);
  if (!reference) await fsp.rm(path.join(root, hash), { recursive: true, force: true }).catch(() => {});
  throw new Error('Workspace changed while snapshotting; capture aborted.');
}

async function insertSnapshotRow(options) {
  const { db, id, workspace, hash, label, author, reason, files, metadata, root } = options;
  await db.exec('BEGIN IMMEDIATE;');
  try {
    await db.run(
      `INSERT INTO workspace_snapshots (id, workspace_id, snapshot_hash, step_number, label, author, reason, diff_summary, metadata)
       SELECT ?, ?, ?, COALESCE(MAX(step_number), 0) + 1, ?, ?, ?, ?, ? FROM workspace_snapshots WHERE workspace_id = ?`,
      id, workspace.id, hash, label, author, reason, JSON.stringify({ fileCount: files.length }), JSON.stringify(metadata), workspace.id
    );
    const inserted = await db.get('SELECT step_number FROM workspace_snapshots WHERE id = ?', id);
    await db.exec('COMMIT;');
    return inserted;
  } catch (error) {
    try { await db.exec('ROLLBACK;'); } catch (_) {}
    const reference = await db.get('SELECT 1 FROM workspace_snapshots WHERE snapshot_hash = ? LIMIT 1', hash).catch(() => null);
    if (!reference) await fsp.rm(path.join(root, hash), { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

async function capture({ db, workspace, label = 'Workspace snapshot', reason = 'Manual snapshot', author = 'studio', agentId = 'system', branchId = 'main', genome = {}, state = { status: 'quiescent' }, worldId = 'world-matrix-0' }) {
  if (!workspace?.path || !fs.existsSync(workspace.path)) throw new Error(`Workspace path does not exist: ${workspace?.path || '<empty>'}`);
  await pruneSnapshotArtifacts({ db, workspaceId: workspace.id, workspacePath: workspace.path });
  const root = snapshotRoot(workspace.path, workspace.id);
  await fsp.mkdir(root, { recursive: true });
  const files = await collectFiles(workspace.path);
  const hash = manifestHash(files);
  const id = `snp-${Date.now().toString(36)}-${crypto.randomBytes(5).toString('hex')}`;

  const manifestData = {
    snapshot_id: id,
    agent_id: agentId,
    branch_id: branchId,
    genome,
    state,
    world_id: worldId,
    created_at: new Date().toISOString()
  };

  await copyManifestPayload({ workspacePath: workspace.path, root, hash, files, manifestData });
  await verifyStableWorkspace({ db, workspacePath: workspace.path, root, hash });
  const manifestPath = path.join(root, hash, 'manifest.json');
  const gitCommit = await resolveGitCommit(workspace.path);
  const metadata = {
    storage: 'durable-filesystem',
    manifestPath,
    storagePath: path.join(root, hash),
    fileCount: files.length,
    hashAlgorithm: 'sha256',
    ...(gitCommit ? { gitCommit } : {})
  };
  const inserted = await insertSnapshotRow({ db, id, workspace, hash, label, author, reason, files, metadata, root });
  const step = inserted.step_number;
  return { id, workspaceId: workspace.id, snapshotHash: hash, stepNumber: step, label, reason, metadata, fileCount: files.length };
}

module.exports = {
  copyManifestPayload,
  pruneSnapshotArtifacts,
  reconcileSnapshotArtifacts,
  capture
};
