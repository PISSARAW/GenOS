/**
 * Durable filesystem snapshots for Studio workspaces.
 *
 * The SQLite row is the index; the manifest and copied files are the durable
 * payload. Files are addressed by a SHA-256 manifest so identical snapshots
 * share one payload directory. Snapshot capture never follows symlinks and
 * deliberately excludes build/dependency directories.
 *
 * Delegation shim: implementations live in the sibling modules
 * (workspaceSnapshotPaths / workspaceSnapshotCollect / workspaceSnapshotPayload /
 * workspaceSnapshotMaterialize / workspaceSnapshotRestore / workspaceSnapshotRun)
 * so every file stays within the quality gate (<= 400 lines, complexity <= 10).
 * Exports are identical to the historical monolith.
 */
const { capture, pruneSnapshotArtifacts, reconcileSnapshotArtifacts } = require('./workspaceSnapshotPayload');
const { getSnapshot, readManifest, materialize } = require('./workspaceSnapshotMaterialize');
const { restore, preview } = require('./workspaceSnapshotRestore');
const { runInSnapshot } = require('./workspaceSnapshotRun');
const { collectFiles } = require('./workspaceSnapshotCollect');
const { snapshotRoot, isSafeRelative } = require('./workspaceSnapshotPaths');
const { isAllowedTestCommand } = require('./workspaceSnapshotRun');

module.exports = { capture, getSnapshot, readManifest, materialize, restore, preview, runInSnapshot, collectFiles, snapshotRoot, pruneSnapshotArtifacts, reconcileSnapshotArtifacts, isAllowedTestCommand, isSafeRelative };
