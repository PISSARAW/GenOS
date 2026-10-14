'use strict';

const path = require('node:path');

async function bind(input) {
  const { db, agentId, workspaceId, request = {} } = input;
  const workspace = await db.get('SELECT id,path,organization_id,project_id FROM workspaces WHERE id = ?', workspaceId);
  if (!workspace) throw Object.assign(new Error(`Workspace '${workspaceId}' does not exist.`), { code: 'MISSION_WORKSPACE_NOT_FOUND' });
  if (!workspace.organization_id || !workspace.project_id) {
    throw Object.assign(new Error(`Workspace '${workspaceId}' has no complete tenant scope.`), { code: 'MISSION_WORKSPACE_SCOPE_REQUIRED' });
  }
  const requestedRoot = request.workspaceRoot || request.workspace_root;
  if (requestedRoot && path.resolve(workspace.path) !== path.resolve(requestedRoot)) {
    throw Object.assign(new Error(`Workspace '${workspaceId}' path does not match the requested mission root.`), { code: 'MISSION_WORKSPACE_PATH_MISMATCH' });
  }
  await assertCompatibleBinding(db, agentId, workspaceId);
  await db.run('UPDATE agents SET workspace_id = ? WHERE id = ? AND (workspace_id IS NULL OR workspace_id = ?)', workspaceId, agentId, workspaceId);
  const saved = await db.get('SELECT workspace_id FROM agents WHERE id = ?', agentId);
  if (saved?.workspace_id !== workspaceId) throw Object.assign(new Error('Orchestrator workspace binding changed concurrently.'), { code: 'ORCHESTRATOR_WORKSPACE_MISMATCH' });
}

async function assertCompatibleBinding(db, agentId, workspaceId) {
  const current = await db.get('SELECT workspace_id FROM agents WHERE id = ?', agentId);
  if (current?.workspace_id && current.workspace_id !== workspaceId) {
    throw Object.assign(new Error(`Orchestrator '${agentId}' already belongs to another workspace.`), { code: 'ORCHESTRATOR_WORKSPACE_MISMATCH' });
  }
}

module.exports = { bind };
