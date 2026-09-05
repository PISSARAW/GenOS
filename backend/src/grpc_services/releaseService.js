const workspaceStore = require('../services/workspaceSnapshotStore');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Release is alive via gRPC!" }),

  CreateSnapshot: async (call, callback) => {
    try {
      const { workspace_id, label } = call.request || {};
      const snap = await workspaceStore.createSnapshot(workspace_id || 'ws-default', label || 'gRPC Release');
      callback(null, { snapshot_id: snap.id || 'snap-1', timestamp: snap.createdAt || new Date().toISOString() });
    } catch (err) {
      callback(null, { snapshot_id: '', timestamp: '' });
    }
  },

  RollbackSnapshot: async (call, callback) => {
    try {
      const { snapshot_id } = call.request || {};
      await workspaceStore.rollbackToSnapshot(snapshot_id);
      callback(null, { success: true, restored_at: new Date().toISOString() });
    } catch (err) {
      callback(null, { success: false, restored_at: '' });
    }
  }
};
