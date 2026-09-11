/**
 * Snapshot restore + preview (split of workspaceSnapshotStore.js).
 */
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');
const { capture } = require('./workspaceSnapshotPayload');
const { parseMetadata, getSnapshot, readManifest, materialize, removeWorkspaceFiles, copyMaterializedFiles, verifyContentHash } = require('./workspaceSnapshotMaterialize');
const { collectFiles, manifestHash } = require('./workspaceSnapshotCollect');

const restoreLocks = new Map();

async function withRestoreLock(workspacePath, operation) {
  const key = path.resolve(workspacePath);
  const previous = restoreLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => { release = resolve; });
  restoreLocks.set(key, current);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (restoreLocks.get(key) === current) restoreLocks.delete(key);
  }
}

function backupSnapshotRef(workspace, backup) {
  return { metadata: backup.metadata, snapshot_hash: backup.snapshotHash, id: backup.id, workspace_id: workspace.id, workspace_path: workspace.path };
}

async function applyRestorePayload(options) {
  const { workspace, target, backup, staging, backupStaging } = options;
  const verified = await materialize(target, staging);
  await materialize(backupSnapshotRef(workspace, backup), backupStaging);
  await removeWorkspaceFiles(workspace.path);
  await copyMaterializedFiles(staging, verified.files, workspace.path);
  verifyContentHash(await collectFiles(workspace.path), verified.files, `Snapshot restore checksum mismatch for ${workspace.path}.`);
  return verified;
}

async function rollbackRestore(options) {
  const { error, workspace, backup, backupStaging } = options;
  try {
    await removeWorkspaceFiles(workspace.path);
    const backupManifest = await readManifest(backupSnapshotRef(workspace, backup));
    await copyMaterializedFiles(backupStaging, backupManifest.files, workspace.path);
    verifyContentHash(await collectFiles(workspace.path), backupManifest.files, `Safety snapshot checksum mismatch for ${workspace.path}.`);
  } catch (rollbackError) {
    error.message += ` Recovery snapshot restore also failed: ${rollbackError.message}`;
  }
}

async function restoreUnlocked({ db, workspace, reference, author = 'studio' }) {
  const target = await getSnapshot(db, workspace.id, reference);
  const backup = await capture({ db, workspace, label: 'Pre-restore safety snapshot', reason: `Before restoring ${target.id}`, author });

  const staging = await fsp.mkdtemp(path.join(os.tmpdir(), 'genos-restore-'));
  const backupStaging = await fsp.mkdtemp(path.join(os.tmpdir(), 'genos-restore-backup-'));
  try {
    await applyRestorePayload({ workspace, target, backup, staging, backupStaging });
    return { success: true, restoredSnapshot: target, safetySnapshot: backup, strategy: 'manifest-copy' };
  } catch (error) {
    await rollbackRestore({ error, workspace, backup, backupStaging });
    throw error;
  } finally {
    await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
    await fsp.rm(backupStaging, { recursive: true, force: true }).catch(() => {});
  }
}

async function restore({ db, workspace, reference, author = 'studio' }) {
  if (!workspace?.path) throw new Error('Workspace path is required for restore.');
  return withRestoreLock(workspace.path, () => restoreUnlocked({ db, workspace, reference, author }));
}

function formatReversePatchLine(file, maps) {
  const from = maps.currentByPath.get(file)?.hash || '<absent>';
  const to = maps.targetByPath.get(file)?.hash || '<absent>';
  return `${file}\n  current: ${from}\n  restore: ${to}`;
}

function buildRestorePreview(target, manifest, current) {
  const currentByPath = new Map(current.map((file) => [file.path, file]));
  const targetByPath = new Map(manifest.files.map((file) => [file.path, file]));
  const affectedFiles = [...new Set([...currentByPath.keys(), ...targetByPath.keys()])].filter((file) => currentByPath.get(file)?.hash !== targetByPath.get(file)?.hash).sort();
  const maps = { currentByPath, targetByPath };
  const reversePatch = affectedFiles.map((file) => formatReversePatchLine(file, maps)).join('\n') || 'No file changes; restore is a no-op.';
  return { targetSnapshot: { ...target, metadata: parseMetadata(target.metadata) }, affectedFiles, reversePatch, affectedFilesCount: affectedFiles.length, durable: true };
}

async function preview({ db, workspace, reference }) {
  const target = await getSnapshot(db, workspace.id, reference);
  const manifest = await readManifest(target);
  const current = await collectFiles(workspace.path);
  return buildRestorePreview(target, manifest, current);
}

module.exports = {
  withRestoreLock,
  restore,
  restoreUnlocked,
  preview
};
