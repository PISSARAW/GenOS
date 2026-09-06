const workspaceLifecycle = require('../services/agentWorkspaceLifecycleService');
const bisectionService = require('../services/bisectionService');
const crypto = require('crypto');
const provisionedWorkspaces = new Map();

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Workspace is alive via gRPC!" }),

  ProvisionWorkspace: async (call, callback) => {
    try {
      const { workspace_id } = call.request || {};
      const workspaceId = workspace_id || 'ws-default';
      const root = await workspaceLifecycle.createIsolatedWorkspace(process.cwd(), `grpc-${workspaceId}-${crypto.randomUUID()}`);
      provisionedWorkspaces.set(workspaceId, root);
      callback(null, { workspace_root: root });
    } catch (err) {
      callback({ code: 13, message: err.message });
    }
  },

  CleanWorkspace: async (call, callback) => {
    try {
      const { workspace_id } = call.request || {};
      const workspaceId = workspace_id || 'ws-default';
      const root = provisionedWorkspaces.get(workspaceId);
      if (!root) throw new Error(`Workspace '${workspaceId}' is not provisioned by this gRPC server.`);
      await workspaceLifecycle.cleanupWorkspace(root);
      provisionedWorkspaces.delete(workspaceId);
      callback(null, { success: true });
    } catch (err) {
      callback({ code: 13, message: err.message });
    }
  },

  GetDiff: async (call, callback) => {
    try {
      const { workspace_id, base_ref, target_ref } = call.request || {};
      const diff = bisectionService.diffWorkspaces(base_ref || workspace_id || 'main', target_ref || workspace_id || 'feature-branch');
      callback(null, {
        diff_text: diff.patch || 'no diff',
        files_changed: diff.filesChanged?.length || 0
      });
    } catch (err) {
      callback({ code: 13, message: err.message });
    }
  }
};
