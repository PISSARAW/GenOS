const workspaceStore = require('../services/workspaceSnapshotStore');
const { getDatabase } = require('../db');

async function workspaceForSnapshot(db, snapshotId) {
  const snapshot = await db.get('SELECT * FROM workspace_snapshots WHERE id = ?', snapshotId);
  if (!snapshot) throw new Error(`Snapshot not found: ${snapshotId}`);
  const workspace = await db.get('SELECT * FROM workspaces WHERE id = ?', snapshot.workspace_id);
  if (!workspace) throw new Error(`Workspace not found: ${snapshot.workspace_id}`);
  return workspace;
}

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Release is alive via gRPC!" }),

  CreateSnapshot: async (call, callback) => {
    try {
      const { workspace_id, label } = call.request || {};
      const db = await getDatabase();
      const workspace = await db.get('SELECT * FROM workspaces WHERE id = ?', workspace_id || 'ws-default');
      if (!workspace) throw new Error(`Workspace not found: ${workspace_id || 'ws-default'}`);
      const snap = await workspaceStore.capture({ db, workspace, label: label || 'gRPC Release', author: 'grpc-release' });
      callback(null, { snapshot_id: snap.id, timestamp: snap.metadata.created_at || new Date().toISOString() });
    } catch (err) {
      callback(null, { snapshot_id: '', timestamp: '' });
    }
  },

  RollbackSnapshot: async (call, callback) => {
    try {
      const { snapshot_id } = call.request || {};
      if (!snapshot_id) throw new Error('snapshot_id is required');
      const db = await getDatabase();
      const workspace = await workspaceForSnapshot(db, snapshot_id);
      await workspaceStore.restore({ db, workspace, reference: snapshot_id, author: 'grpc-release' });
      callback(null, { success: true, restored_at: new Date().toISOString() });
    } catch (err) {
      callback(null, { success: false, restored_at: '' });
    }
  }
};
