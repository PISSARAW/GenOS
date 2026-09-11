const fs = require('fs/promises');
const path = require('path');
const os = require('os');

function restore({ db, workspace, reference, author = 'studio' }) {
  if (!workspace?.path) throw new Error('Workspace path is required for restore.');
  const { withRestoreLock } = require('./workspaceSnapshotStore');
  return withRestoreLock(workspace.path, () => restoreUnlocked({ db, workspace, reference, author }));
}

async function restoreUnlocked({ db, workspace, reference, author = 'studio' }) {
  const { getSnapshot } = require('./workspaceSnapshotStore');
  const { capture } = require('./workspaceSnapshotStore');
  const { materialize } = require('./workspaceSnapshotStore');
  const { removeWorkspaceFiles } = require('./workspaceSnapshotStore');
  const { copyMaterializedFiles } = require('./workspaceSnapshotStore');
  const { manifestHash } = require('./workspaceSnapshotStore');
  const { collectFiles } = require('./workspaceSnapshotStore');
  const { readManifest } = require('./workspaceSnapshotStore');
  const target = await getSnapshot(db, workspace.id, reference);
  const backup = await capture({ db, workspace, label: 'Pre-restore safety snapshot', reason: `Before restoring ${target.id}`, author });
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-restore-'));
  const backupStaging = await fs.mkdtemp(path.join(os.tmpdir(), 'genos-restore-backup-'));
  try {
    const verified = await materialize(target, staging);
    await materialize({ metadata: backup.metadata, snapshot_hash: backup.snapshotHash, id: backup.id, workspace_id: workspace.id, workspace_path: workspace.path }, backupStaging);
    await removeWorkspaceFiles(workspace.path);
    await copyMaterializedFiles(staging, verified.files, workspace.path);
    if (manifestHash(await collectFiles(workspace.path)) !== verified.hash) throw new Error(`Snapshot restore checksum mismatch for ${workspace.path}.`);
    return { success: true, restoredSnapshot: target, safetySnapshot: backup, strategy: 'manifest-copy' };
  } catch (error) {
    try {
      await removeWorkspaceFiles(workspace.path);
      const backupManifest = await readManifest({ metadata: backup.metadata, snapshot_hash: backup.snapshotHash, id: backup.id, workspace_id: workspace.id, workspace_path: workspace.path });
      await copyMaterializedFiles(backupStaging, backupManifest.files, workspace.path);
      if (manifestHash(await collectFiles(workspace.path)) !== backupManifest.hash) throw new Error(`Safety snapshot checksum mismatch for ${workspace.path}.`);
    } catch (rollbackError) { error.message += ` Recovery snapshot restore also failed: ${rollbackError.message}`; }
    throw error;
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
    await fs.rm(backupStaging, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = {
  restore,
  restoreUnlocked
};
