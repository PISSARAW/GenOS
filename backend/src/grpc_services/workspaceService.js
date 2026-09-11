const workspaceLifecycle = require('../services/agentWorkspaceLifecycleService');
const workspaceStore = require('../services/workspaceSnapshotStore');

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Workspace is alive via gRPC!" }),

  ProvisionWorkspace: async (call, callback) => {
    try {
      const { workspace_id } = call.request || {};
      const root = await workspaceLifecycle.provisionWorkspace(workspace_id || 'ws-default');
      callback(null, { workspace_root: root || process.cwd() });
    } catch (err) {
      callback(null, { workspace_root: process.cwd() });
    }
  },

  CleanWorkspace: async (call, callback) => {
    try {
      const { workspace_id } = call.request || {};
      await workspaceLifecycle.cleanupWorkspace(workspace_id || 'ws-default');
      callback(null, { success: true });
    } catch (err) {
      callback(null, { success: false });
    }
  },

  GetDiff: async (call, callback) => {
    try {
      const { workspace_id, base_ref, target_ref } = call.request || {};
      const diff = await workspaceStore.computeWorkspaceDiff(workspace_id, base_ref, target_ref);
      callback(null, {
        diff_text: diff.patch || 'no diff',
        files_changed: diff.filesChanged?.length || 0
      });
    } catch (err) {
      callback(null, { diff_text: '', files_changed: 0 });
    }
  }
};
