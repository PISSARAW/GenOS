const workspaceLifecycle = require('../services/agentWorkspaceLifecycleService');
const bisectionService = require('../services/bisectionService');
const crypto = require('crypto');
const { getDatabase } = require('../db');
const provisionedWorkspaces = new Map();

function grpcError(error) {
  return { code: /required|not available/i.test(error.message) ? 3 : 13, message: error.message };
}

async function resolveWorkspace(request) {
  const workspaceId = String(request.workspace_id || '').trim();
  if (!workspaceId) throw new Error('workspace_id is required.');
  const organizationId = String(request.organization_id || '').trim();
  const projectId = String(request.project_id || '').trim();
  const db = await getDatabase();
  const workspace = organizationId && projectId
    ? await db.get('SELECT * FROM workspaces WHERE id = ? AND organization_id = ? AND project_id = ?', workspaceId, organizationId, projectId)
    : await db.get('SELECT * FROM workspaces WHERE id = ? AND organization_id IS NULL AND project_id IS NULL', workspaceId);
  if (!workspace) throw new Error(`Workspace '${workspaceId}' is not available in the requested project.`);
  return workspace;
}

module.exports = {
  Ping: (call, callback) => callback(null, { status: "Service Workspace is alive via gRPC!" }),

  ProvisionWorkspace: async (call, callback) => {
    try {
      const request = call.request || {};
      const workspace = await resolveWorkspace(request);
      const root = await workspaceLifecycle.createIsolatedWorkspace(workspace.path, `grpc-${workspace.id}-${crypto.randomUUID()}`);
      provisionedWorkspaces.set(workspace.id, root);
      callback(null, { workspace_root: root });
    } catch (err) {
      callback(grpcError(err));
    }
  },

  CleanWorkspace: async (call, callback) => {
    try {
      const request = call.request || {};
      const workspace = await resolveWorkspace(request);
      const workspaceId = workspace.id;
      const root = provisionedWorkspaces.get(workspaceId);
      if (!root) throw new Error(`Workspace '${workspaceId}' is not provisioned by this gRPC server.`);
      await workspaceLifecycle.cleanupWorkspace(root);
      provisionedWorkspaces.delete(workspaceId);
      callback(null, { success: true });
    } catch (err) {
      callback(grpcError(err));
    }
  },

  GetDiff: async (call, callback) => {
    try {
      const request = call.request || {};
      const workspace = await resolveWorkspace(request);
      const diff = bisectionService.diffWorkspaces(request.base_ref || workspace.name, request.target_ref || workspace.name);
      callback(null, {
        diff_text: diff.patch || 'no diff',
        files_changed: diff.filesChanged?.length || 0
      });
    } catch (err) {
      callback(grpcError(err));
    }
  }
};
