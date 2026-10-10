'use strict';

const { withTransaction } = require('../../db');
const snapshots = require('../workspaceSnapshotStore');
const { importWorkspace } = require('./import');
const storage = require('./storage');

function assertSameProjection(legacy, current) {
  const original = legacy.files.map((file) => `${file.path}\0${file.hash}\0${file.size}`).sort();
  const imported = current.manifest.files.map((file) => `${file.path}\0${file.hash}\0${file.size}`).sort();
  if (JSON.stringify(original) !== JSON.stringify(imported)) {
    throw new Error('GQWF import differs from the verified legacy snapshot.');
  }
}

async function importLegacySnapshot(db, input, snapshotStore = snapshots) {
  const workspace = await storage.workspace(db, input.workspaceId);
  const snapshot = await snapshotStore.getSnapshot(db, input.workspaceId, input.reference);
  const manifest = await snapshotStore.readManifest(snapshot);
  const built = await importWorkspace(manifest.payloadRoot, workspace.path);
  assertSameProjection(manifest, built);
  return withTransaction(db, async () => {
    await storage.putRoot(db, input.workspaceId, built);
    const existing = await db.get('SELECT legacy_hash, root_hash FROM gqwf_legacy_links WHERE workspace_id = ? AND snapshot_id = ?',
      input.workspaceId, snapshot.id);
    if (existing && (existing.legacy_hash !== snapshot.snapshot_hash || existing.root_hash !== built.hash)) {
      throw new Error('GQWF legacy snapshot link changed.');
    }
    if (!existing) await db.run(`INSERT INTO gqwf_legacy_links
      (workspace_id, snapshot_id, legacy_hash, root_hash) VALUES (?, ?, ?, ?)`,
    input.workspaceId, snapshot.id, snapshot.snapshot_hash, built.hash);
    return { snapshotId: snapshot.id, legacyHash: snapshot.snapshot_hash, rootHash: built.hash };
  });
}

module.exports = { importLegacySnapshot };
